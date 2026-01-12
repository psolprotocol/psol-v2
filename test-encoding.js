const snarkjs = require("snarkjs");
const fs = require("fs");

async function main() {
  // Load the VK to check the known generator point format
  const vkJson = JSON.parse(fs.readFileSync("./circuits/build/deposit_vk.json", "utf-8"));
  
  console.log("=== snarkjs vk_beta_2 structure ===");
  console.log("vk_beta_2[0] (x):", vkJson.vk_beta_2[0]);
  console.log("vk_beta_2[1] (y):", vkJson.vk_beta_2[1]);
  console.log("");
  console.log("In snarkjs: point[0] = [c0, c1] means Fq2 element = c0 + c1*u");
  console.log("So point[0][0] is the REAL part (c0)");
  console.log("So point[0][1] is the IMAGINARY part (c1)");
  console.log("");
  
  // The Solana alt_bn128 expects: | x_c1 | x_c0 | y_c1 | y_c0 |
  // Which means: | x_imag | x_real | y_imag | y_real |
  
  // Check the gamma_g2 which has a known value
  console.log("=== vk_gamma_2 (should be generator G2) ===");
  console.log("gamma_g2:", vkJson.vk_gamma_2);
  
  // Known BN254 G2 generator point:
  // x = 11559732032986387107991004021392285783925812861821192530917403151452391805634 
  //   + 10857046999023057135944570762232829481370756359578518086990519993285655852781 * u
  // y = 4082367875863433681332203403145435568316851327593401208105741076214120093531 
  //   + 8495653923123431417604973247489272438418190587263600148770280649306958101930 * u
  
  const known_g2_x_real = BigInt("11559732032986387107991004021392285783925812861821192530917403151452391805634");
  const known_g2_x_imag = BigInt("10857046999023057135944570762232829481370756359578518086990519993285655852781");
  
  console.log("\nKnown G2 generator x.real:", known_g2_x_real.toString());
  console.log("Known G2 generator x.imag:", known_g2_x_imag.toString());
  console.log("vk_gamma_2[0][0]:", vkJson.vk_gamma_2[0][0]);
  console.log("vk_gamma_2[0][1]:", vkJson.vk_gamma_2[0][1]);
  
  // If vk_gamma_2[0][0] matches x_real, then [0] is real, [1] is imaginary
  // If vk_gamma_2[0][0] matches x_imag, then [0] is imaginary, [1] is real
  
  if (BigInt(vkJson.vk_gamma_2[0][0]) === known_g2_x_real) {
    console.log("\n✅ CONFIRMED: snarkjs [0][0] = REAL, [0][1] = IMAGINARY");
  } else if (BigInt(vkJson.vk_gamma_2[0][0]) === known_g2_x_imag) {
    console.log("\n⚠️ CONFIRMED: snarkjs [0][0] = IMAGINARY, [0][1] = REAL");
  } else {
    console.log("\n❓ gamma_g2 is NOT the generator - checking encoding anyway...");
  }
  
  // Now let's verify our encoding matches what Solana expects
  // Solana's alt_bn128 uses Ethereum's format: | c1 | c0 | for Fq2 (imaginary first!)
  console.log("\n=== Required byte encoding for Solana ===");
  console.log("Solana G2: | x_c1 (imag) | x_c0 (real) | y_c1 (imag) | y_c0 (real) |");
  console.log("So from snarkjs we need: | [0][1] | [0][0] | [1][1] | [1][0] |");
}

main().catch(console.error);
