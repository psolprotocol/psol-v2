//! Shared types for pSOL Privacy Pool v2
//!
//! This module contains common types used across the program.

use anchor_lang::prelude::*;

/// Proof types supported by pSOL v2
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProofType {
    /// Deposit proof (proves valid commitment)
    Deposit = 0,
    /// Withdrawal proof (proves valid nullifier and membership)
    Withdraw = 1,
    /// Join-Split proof (proves value conservation in internal transfer)
    JoinSplit = 2,
    /// Membership proof (proves stake ≥ threshold without spending)
    Membership = 3,
}

impl ProofType {
    pub fn as_seed(&self) -> &[u8] {
        match self {
            ProofType::Deposit => b"vk_deposit",
            ProofType::Withdraw => b"vk_withdraw",
            ProofType::JoinSplit => b"vk_joinsplit",
            ProofType::Membership => b"vk_membership",
        }
    }
}

/// Shielded action types for CPI
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ShieldedActionType {
    /// Swap via DEX (e.g., Jupiter)
    DexSwap = 0,
    /// Deposit to lending protocol
    LendingDeposit = 1,
    /// Borrow from lending protocol
    LendingBorrow = 2,
    /// Stake tokens
    Stake = 3,
    /// Unstake tokens
    Unstake = 4,
    /// Custom action (protocol-specific)
    Custom = 255,
}
