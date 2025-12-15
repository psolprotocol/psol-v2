//! Configure Compliance Instruction
//!
//! Configures compliance settings for the pool including audit requirements.

use anchor_lang::prelude::*;

use crate::events::ComplianceConfigured;
use crate::ConfigureCompliance;

/// Handler for configure_compliance instruction
pub fn handler(
    ctx: Context<ConfigureCompliance>,
    require_encrypted_note: bool,
    audit_pubkey: Option<Pubkey>,
    metadata_schema_version: u8,
) -> Result<()> {
    let compliance = &mut ctx.accounts.compliance_config;

    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;

    // Configure compliance settings
    compliance.configure(
        require_encrypted_note,
        audit_pubkey,
        metadata_schema_version,
        timestamp,
    );

    // Emit event
    emit!(ComplianceConfigured {
        pool: ctx.accounts.pool_config.key(),
        require_encrypted_note,
        audit_enabled: compliance.audit_enabled,
        audit_pubkey: compliance.audit_pubkey,
        compliance_level: compliance.compliance_level,
        timestamp,
    });

    msg!(
        "Compliance configured: level={}, require_note={}, audit={}",
        compliance.compliance_level,
        require_encrypted_note,
        compliance.audit_enabled
    );

    Ok(())
}
