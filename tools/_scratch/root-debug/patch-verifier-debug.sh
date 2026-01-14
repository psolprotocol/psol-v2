#!/bin/bash
# Patch groth16.rs to add debug logging

# Backup original
cp programs/psol-privacy-v2/src/crypto/groth16.rs programs/psol-privacy-v2/src/crypto/groth16.rs.bak

# Create patched verify function
cat > /tmp/verify_patch.rs << 'PATCH'
/// Verify a Groth16 proof.
///
/// # Arguments
/// * `vk` - Verification key
/// * `proof` - The proof to verify
/// * `public_inputs` - Public inputs (canonical Fr elements)
///
/// # Returns
/// * `Ok(true)` - proof is valid
/// * `Ok(false)` - proof is invalid (pairing check failed)
/// * `Err(_)` - cryptographic error (invalid points, non-canonical inputs, etc.)
///
/// # Compute Cost
/// ~350,000 CU on Solana mainnet. Set compute budget explicitly.
pub fn verify(
    vk: &VerificationKey,
    proof: &Proof,
    public_inputs: &[Scalar],
) -> Result<bool> {
    msg!("verify: START");
    msg!("verify: public_inputs.len()={}", public_inputs.len());
    msg!("verify: vk.ic.len()={}", vk.ic.len());
    
    // Validate input count
    if public_inputs.len() > MAX_PUBLIC_INPUTS {
        msg!("verify: FAIL - too many public inputs");
        return Err(PrivacyErrorV2::InvalidPublicInputs.into());
    }
    vk.validate_for_inputs(public_inputs.len())?;
    msg!("verify: input count validated OK");

    // Validate all public inputs are canonical
    for (i, input) in public_inputs.iter().enumerate() {
        if !is_valid_fr(input) {
            msg!("verify: FAIL - public_input[{}] not canonical Fr", i);
            return Err(PrivacyErrorV2::InvalidPublicInputs.into());
        }
    }
    msg!("verify: all public inputs canonical OK");

    // Compute vk_x = IC[0] + Σ(input[i] · IC[i+1])
    msg!("verify: computing vk_x...");
    let vk_x = compute_vk_x(&vk.ic, public_inputs).map_err(|e| {
        msg!("verify: FAIL - compute_vk_x error");
        e
    })?;
    msg!("verify: vk_x computed OK");

    // Negate A: -A (uses Fp for negation, not Fr)
    msg!("verify: negating A...");
    let neg_a = g1_negate(&proof.a).map_err(|e| {
        msg!("verify: FAIL - g1_negate error");
        e
    })?;
    msg!("verify: A negated OK");

    // Build 4 pairing elements for check:
    // e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1
    msg!("verify: building pairing elements...");
    let pairs: [[u8; 192]; 4] = [
        make_pairing_element(&neg_a, &proof.b),
        make_pairing_element(&vk.alpha_g1, &vk.beta_g2),
        make_pairing_element(&vk_x, &vk.gamma_g2),
        make_pairing_element(&proof.c, &vk.delta_g2),
    ];
    msg!("verify: pairing elements built OK");

    msg!("verify: calling pairing_check_4...");
    let result = pairing_check_4(&pairs).map_err(|e| {
        msg!("verify: FAIL - pairing_check_4 error");
        e
    })?;
    msg!("verify: pairing_check_4 returned {}", result);
    
    Ok(result)
}

/// Compute vk_x = IC[0] + Σ(input[i] · IC[i+1])
fn compute_vk_x(ic: &[G1Point], inputs: &[Scalar]) -> Result<G1Point> {
    msg!("compute_vk_x: START, ic.len()={}, inputs.len()={}", ic.len(), inputs.len());
    let mut vk_x = ic[0];
    msg!("compute_vk_x: initialized with IC[0]");

    for (i, input) in inputs.iter().enumerate() {
        msg!("compute_vk_x: processing input[{}]", i);
        
        // Skip zero inputs (no contribution)
        if input.iter().all(|&b| b == 0) {
            msg!("compute_vk_x: input[{}] is zero, skipping", i);
            continue;
        }

        // Compute input[i] · IC[i+1]
        msg!("compute_vk_x: calling g1_mul for IC[{}]", i + 1);
        let product = g1_mul(&ic[i + 1], input).map_err(|e| {
            msg!("compute_vk_x: FAIL - g1_mul error at i={}", i);
            e
        })?;
        msg!("compute_vk_x: g1_mul OK for i={}", i);

        // Skip identity results
        if is_g1_identity(&product) {
            msg!("compute_vk_x: product is identity, skipping");
            continue;
        }

        // Add to accumulator
        if is_g1_identity(&vk_x) {
            msg!("compute_vk_x: vk_x is identity, replacing with product");
            vk_x = product;
        } else {
            msg!("compute_vk_x: calling g1_add");
            vk_x = g1_add(&vk_x, &product).map_err(|e| {
                msg!("compute_vk_x: FAIL - g1_add error at i={}", i);
                e
            })?;
            msg!("compute_vk_x: g1_add OK");
        }
    }

    msg!("compute_vk_x: DONE");
    Ok(vk_x)
}
PATCH

echo "Patched verify function created"
echo ""
echo "Now we need to replace the verify and compute_vk_x functions in groth16.rs"
