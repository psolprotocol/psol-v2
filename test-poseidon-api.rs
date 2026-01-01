// Test to understand light-poseidon API
use light_poseidon::Poseidon;

fn main() {
    // Try different API approaches
    let inputs = vec![[1u8; 32], [2u8; 32]];
    
    // Attempt 1: Direct construction
    // let hasher = Poseidon::new();
    
    // Attempt 2: With parameter
    // let hasher = Poseidon::new_circom(2);
    
    println!("Testing light-poseidon API");
}
