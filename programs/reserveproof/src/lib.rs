use anchor_lang::prelude::*;

declare_id!("FjEHMifJ2YYm5sH2nXr7kQu7tUYVrGwJmeFS8oY5yVME");

const MAX_ID_LEN: usize = 64;
const ID_ALLOWED_PUNCTUATION: &[u8] = b"._:-";

#[program]
pub mod reserveproof {
    use super::*;

    pub fn initialize_treasury(
        ctx: Context<InitializeTreasury>,
        treasury_id: String,
    ) -> Result<()> {
        validate_id(&treasury_id)?;

        let treasury = &mut ctx.accounts.treasury;
        treasury.authority = ctx.accounts.authority.key();
        treasury.treasury_id = treasury_id;
        treasury.bump = ctx.bumps.treasury;
        treasury.created_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    /// Records an authority-attested snapshot. This instruction does not verify
    /// external asset ownership, liability completeness, or a ZK proof.
    pub fn record_snapshot(
        ctx: Context<RecordSnapshot>,
        treasury_id: String,
        snapshot_id: String,
        denomination: [u8; 32],
        eligible_assets: u64,
        liabilities_total: u64,
        merkle_root: [u8; 32],
    ) -> Result<()> {
        validate_id(&snapshot_id)?;
        validate_denomination(&denomination)?;

        let snapshot = &mut ctx.accounts.snapshot;
        snapshot.authority = ctx.accounts.authority.key();
        snapshot.treasury = ctx.accounts.treasury.key();
        snapshot.treasury_id = treasury_id;
        snapshot.snapshot_id = snapshot_id;
        snapshot.denomination = denomination;
        snapshot.eligible_assets = eligible_assets;
        snapshot.liabilities_total = liabilities_total;
        snapshot.merkle_root = merkle_root;
        snapshot.is_solvent = is_solvent(eligible_assets, liabilities_total);
        snapshot.bump = ctx.bumps.snapshot;
        snapshot.created_at = Clock::get()?.unix_timestamp;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(treasury_id: String)]
pub struct InitializeTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Treasury::INIT_SPACE,
        seeds = [
            b"treasury",
            authority.key().as_ref(),
            id_seed(&treasury_id).as_ref()
        ],
        bump
    )]
    pub treasury: Account<'info, Treasury>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(treasury_id: String, snapshot_id: String)]
pub struct RecordSnapshot<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [
            b"treasury",
            authority.key().as_ref(),
            id_seed(&treasury_id).as_ref()
        ],
        bump = treasury.bump,
        has_one = authority @ ReserveProofError::Unauthorized
    )]
    pub treasury: Account<'info, Treasury>,
    #[account(
        init,
        payer = authority,
        space = 8 + TreasurySnapshot::INIT_SPACE,
        seeds = [
            b"snapshot",
            treasury.key().as_ref(),
            id_seed(&snapshot_id).as_ref()
        ],
        bump
    )]
    pub snapshot: Account<'info, TreasurySnapshot>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Treasury {
    pub authority: Pubkey,
    #[max_len(MAX_ID_LEN)]
    pub treasury_id: String,
    pub bump: u8,
    pub created_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct TreasurySnapshot {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    #[max_len(MAX_ID_LEN)]
    pub treasury_id: String,
    #[max_len(MAX_ID_LEN)]
    pub snapshot_id: String,
    /// Identifier for the unit in which both totals are denominated.
    pub denomination: [u8; 32],
    pub eligible_assets: u64,
    pub liabilities_total: u64,
    pub merkle_root: [u8; 32],
    /// A mathematical comparison of the submitted totals, not an asset proof.
    pub is_solvent: bool,
    pub bump: u8,
    pub created_at: i64,
}

fn validate_id(id: &str) -> Result<()> {
    let bytes = id.as_bytes();
    require!(
        !bytes.is_empty() && bytes.len() <= MAX_ID_LEN,
        ReserveProofError::InvalidId
    );
    require!(
        bytes
            .iter()
            .all(|byte| { byte.is_ascii_alphanumeric() || ID_ALLOWED_PUNCTUATION.contains(byte) }),
        ReserveProofError::InvalidId
    );
    Ok(())
}

fn is_solvent(eligible_assets: u64, liabilities_total: u64) -> bool {
    eligible_assets >= liabilities_total
}

fn id_seed(id: &str) -> [u8; 32] {
    anchor_lang::solana_program::hash::hashv(&[b"reserveproof:id:v1", id.as_bytes()]).to_bytes()
}

fn validate_denomination(denomination: &[u8; 32]) -> Result<()> {
    require!(
        denomination.iter().any(|byte| *byte != 0),
        ReserveProofError::InvalidDenomination
    );
    Ok(())
}

#[error_code]
pub enum ReserveProofError {
    #[msg("Identifier must be 1-64 ASCII letters, digits, dots, underscores, colons, or hyphens")]
    InvalidId,
    #[msg("The denomination identifier cannot be all zeroes")]
    InvalidDenomination,
    #[msg("Only the treasury authority may record snapshots")]
    Unauthorized,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_valid_id() {
        assert!(validate_id("treasury-2026.10:11_test").is_ok());
    }

    #[test]
    fn derives_stable_and_distinct_pda_id_seeds() {
        assert_eq!(id_seed("snapshot-1"), id_seed("snapshot-1"));
        assert_ne!(id_seed("snapshot-1"), id_seed("snapshot-2"));
    }

    #[test]
    fn rejects_empty_id() {
        assert!(validate_id("").is_err());
    }

    #[test]
    fn accepts_id_at_maximum_length() {
        assert!(validate_id(&"a".repeat(MAX_ID_LEN)).is_ok());
    }

    #[test]
    fn rejects_id_over_maximum_length() {
        assert!(validate_id(&"a".repeat(MAX_ID_LEN + 1)).is_err());
    }

    #[test]
    fn rejects_non_ascii_or_unsupported_id_characters() {
        assert!(validate_id("treasury/one").is_err());
        assert!(validate_id("trésorerie").is_err());
    }

    #[test]
    fn reports_solvent_when_assets_exceed_liabilities() {
        assert!(is_solvent(101, 100));
    }

    #[test]
    fn reports_solvent_when_assets_equal_liabilities() {
        assert!(is_solvent(100, 100));
    }

    #[test]
    fn reports_insolvent_when_liabilities_exceed_assets() {
        assert!(!is_solvent(99, 100));
    }

    #[test]
    fn zero_assets_and_zero_liabilities_are_mathematically_solvent() {
        assert!(is_solvent(0, 0));
    }

    #[test]
    fn handles_maximum_u64_values_without_arithmetic() {
        assert!(is_solvent(u64::MAX, u64::MAX));
        assert!(!is_solvent(u64::MAX - 1, u64::MAX));
    }

    #[test]
    fn rejects_an_empty_denomination_tag() {
        assert!(validate_denomination(&[0; 32]).is_err());
    }

    #[test]
    fn accepts_a_nonzero_denomination_tag() {
        let mut denomination = [0; 32];
        denomination[31] = 1;
        assert!(validate_denomination(&denomination).is_ok());
    }
}
