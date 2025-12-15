//! Minimal pSOL v2 program for testing compilation

use anchor_lang::prelude::*;

declare_id!("PsoL2zwoN2xC4X4Qr8MJLnkNPt7aFWfpTdKnpRxHGxd");

#[program]
pub mod psol_privacy_v2 {
    use super::*;

    pub fn test_instruction(ctx: Context<TestAccounts>) -> Result<()> {
        msg!("Test instruction called");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct TestAccounts<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
}
