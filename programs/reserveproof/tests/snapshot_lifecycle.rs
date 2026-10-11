use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use reserveproof::{accounts, instruction, Treasury, TreasurySnapshot, ID};
use solana_program_test::{ProgramTest, ProgramTestContext};
use solana_sdk::{
    instruction::Instruction,
    signature::{Keypair, Signer},
    system_instruction, system_program,
    transaction::Transaction,
};

const DOMAIN: &[u8] = b"reserveproof:id:v1";

fn pda_id_seed(id: &str) -> [u8; 32] {
    anchor_lang::solana_program::hash::hashv(&[DOMAIN, id.as_bytes()]).to_bytes()
}

fn treasury_pda(
    authority: &solana_sdk::pubkey::Pubkey,
    treasury_id: &str,
) -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(
        &[b"treasury", authority.as_ref(), &pda_id_seed(treasury_id)],
        &ID,
    )
    .0
}

fn snapshot_pda(
    treasury: &solana_sdk::pubkey::Pubkey,
    snapshot_id: &str,
) -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(
        &[b"snapshot", treasury.as_ref(), &pda_id_seed(snapshot_id)],
        &ID,
    )
    .0
}

async fn send_instruction(
    context: &mut ProgramTestContext,
    instruction: Instruction,
    additional_signers: &[&Keypair],
) -> Result<(), String> {
    let blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .map_err(|error| format!("{error:?}"))?;

    let mut signers: Vec<&dyn Signer> = vec![&context.payer];
    signers.extend(
        additional_signers
            .iter()
            .map(|signer| *signer as &dyn Signer),
    );
    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&context.payer.pubkey()),
        &signers,
        blockhash,
    );

    context
        .banks_client
        .process_transaction(transaction)
        .await
        .map_err(|error| format!("{error:?}"))
}

#[tokio::test]
async fn treasury_snapshot_instruction_scenarios() {
    let program_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../target/deploy")
        .canonicalize()
        .expect("build the SBF program before running instruction tests");
    assert!(program_dir.join("reserveproof.so").exists());
    std::env::set_var("BPF_OUT_DIR", &program_dir);

    let mut program_test = ProgramTest::new("reserveproof", ID, None);
    program_test.prefer_bpf(true);
    let mut context = program_test.start_with_context().await;
    let authority = context.payer.pubkey();
    let treasury_id = "reserve-main";
    let treasury = treasury_pda(&authority, treasury_id);
    let mut next_warp_slot = 10;

    let initialize = Instruction {
        program_id: ID,
        accounts: accounts::InitializeTreasury {
            authority,
            treasury,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::InitializeTreasury {
            treasury_id: treasury_id.to_owned(),
        }
        .data(),
    };
    send_instruction(&mut context, initialize.clone(), &[])
        .await
        .expect("authorized treasury initialization should succeed");

    let treasury_account = context
        .banks_client
        .get_account(treasury)
        .await
        .expect("treasury account lookup should succeed")
        .expect("treasury PDA should exist");
    let mut treasury_data = treasury_account.data.as_slice();
    let treasury_state =
        Treasury::try_deserialize(&mut treasury_data).expect("treasury account should deserialize");
    assert_eq!(treasury_state.authority, authority);
    assert_eq!(treasury_state.treasury_id, treasury_id);

    context
        .warp_to_slot(next_warp_slot)
        .expect("advance the bank to give the duplicate transaction a fresh blockhash");
    next_warp_slot += 1;
    assert!(
        send_instruction(&mut context, initialize, &[])
            .await
            .is_err(),
        "reinitializing the same treasury PDA must fail"
    );

    let record_snapshot =
        |snapshot_id: &str, assets: u64, liabilities: u64, denomination| Instruction {
            program_id: ID,
            accounts: accounts::RecordSnapshot {
                authority,
                treasury,
                snapshot: snapshot_pda(&treasury, snapshot_id),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::RecordSnapshot {
                treasury_id: treasury_id.to_owned(),
                snapshot_id: snapshot_id.to_owned(),
                denomination,
                eligible_assets: assets,
                liabilities_total: liabilities,
                merkle_root: [7; 32],
            }
            .data(),
        };

    let solvent_snapshot = record_snapshot("snapshot-1", 120, 100, [1; 32]);
    send_instruction(&mut context, solvent_snapshot.clone(), &[])
        .await
        .expect("snapshot with eligible assets above liabilities should be recorded");
    let solvent_account = context
        .banks_client
        .get_account(snapshot_pda(&treasury, "snapshot-1"))
        .await
        .expect("snapshot account lookup should succeed")
        .expect("snapshot PDA should exist");
    let mut solvent_data = solvent_account.data.as_slice();
    let solvent_state = TreasurySnapshot::try_deserialize(&mut solvent_data)
        .expect("snapshot account should deserialize");
    assert!(solvent_state.is_solvent);
    assert_eq!(solvent_state.eligible_assets, 120);
    assert_eq!(solvent_state.liabilities_total, 100);

    context
        .warp_to_slot(next_warp_slot)
        .expect("advance the bank to give the duplicate snapshot a fresh blockhash");
    assert!(
        send_instruction(&mut context, solvent_snapshot, &[])
            .await
            .is_err(),
        "a snapshot ID must not be reusable"
    );

    let insolvent_snapshot = record_snapshot("snapshot-2", 99, 100, [1; 32]);
    send_instruction(&mut context, insolvent_snapshot, &[])
        .await
        .expect("an insolvent result should be recorded rather than rejected");
    let insolvent_account = context
        .banks_client
        .get_account(snapshot_pda(&treasury, "snapshot-2"))
        .await
        .expect("snapshot account lookup should succeed")
        .expect("insolvent snapshot PDA should exist");
    let mut insolvent_data = insolvent_account.data.as_slice();
    let insolvent_state = TreasurySnapshot::try_deserialize(&mut insolvent_data)
        .expect("snapshot account should deserialize");
    assert!(!insolvent_state.is_solvent);

    let invalid_denomination = record_snapshot("snapshot-empty-unit", 1, 1, [0; 32]);
    assert!(
        send_instruction(&mut context, invalid_denomination, &[])
            .await
            .is_err(),
        "an all-zero denomination must be rejected"
    );

    let invalid_id = record_snapshot(&"x".repeat(65), 1, 1, [1; 32]);
    assert!(
        send_instruction(&mut context, invalid_id, &[])
            .await
            .is_err(),
        "snapshot IDs above 64 bytes must be rejected"
    );

    let unauthorized = Keypair::new();
    let fund_unauthorized = system_instruction::transfer(
        &context.payer.pubkey(),
        &unauthorized.pubkey(),
        1_000_000_000,
    );
    send_instruction(&mut context, fund_unauthorized, &[])
        .await
        .expect("unauthorized signer test account should be funded");

    let unauthorized_instruction = Instruction {
        program_id: ID,
        accounts: accounts::RecordSnapshot {
            authority: unauthorized.pubkey(),
            treasury,
            snapshot: snapshot_pda(&treasury, "unauthorized"),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::RecordSnapshot {
            treasury_id: treasury_id.to_owned(),
            snapshot_id: "unauthorized".to_owned(),
            denomination: [1; 32],
            eligible_assets: 1,
            liabilities_total: 1,
            merkle_root: [7; 32],
        }
        .data(),
    };
    assert!(
        send_instruction(&mut context, unauthorized_instruction, &[&unauthorized])
            .await
            .is_err(),
        "a different signer must not record a treasury snapshot"
    );
}
