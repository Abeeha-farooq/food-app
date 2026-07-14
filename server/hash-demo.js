// hash-demo.js
// Pure teaching demo - hashes a FAKE password to show what bcrypt does.
// Nothing here touches the database or real users.

import bcrypt from "bcryptjs";

const password = "demoPassword123";

console.log("=== Plaintext vs Hashed ===\n");
console.log("Plaintext password :", password);

console.log("\n=== Hash the SAME password 3 times ===\n");
for (let i = 1; i <= 3; i++) {
  const hash = await bcrypt.hash(password, 10);
  console.log(`Hash #${i}: ${hash}`);
}

console.log("\n=== What does each hash START with? ===\n");
const sample = await bcrypt.hash(password, 10);
console.log("First 7 chars:", sample.substring(0, 7));
console.log("Next 22 chars (the 'salt' part):", sample.substring(7, 29));
console.log("Rest (the actual hash):", sample.substring(29));

console.log("\n=== Does the hash actually match? ===\n");
for (let i = 1; i <= 3; i++) {
  const hash = await bcrypt.hash(password, 10);
  const match = await bcrypt.compare(password, hash);
  console.log(`Hash #${i} matches "${password}"? ${match}`);
}

console.log("\n=== What if the user types the wrong password? ===\n");
const realHash = await bcrypt.hash(password, 10);
const wrongResult = await bcrypt.compare("wrongPassword", realHash);
console.log(`compare("wrongPassword", realHash) = ${wrongResult}`);

console.log("\n=== Different passwords produce completely different hashes ===\n");
const a = await bcrypt.hash("password", 10);
const b = await bcrypt.hash("Password", 10);   // capital P
const c = await bcrypt.hash("password ", 10);  // trailing space
console.log(`"password"  -> ${a}`);
console.log(`"Password"  -> ${b}`);
console.log(`"password " -> ${c}`);
console.log("\nNote: even tiny changes (capital, space) make the hash completely different.");

console.log("\n=== Cost factor: what does the '10' do? ===\n");
console.log("Hashing with cost 8:");
const t8 = Date.now();
await bcrypt.hash(password, 8);
console.log(`  took ${Date.now() - t8} ms`);

console.log("Hashing with cost 10:");
const t10 = Date.now();
await bcrypt.hash(password, 10);
console.log(`  took ${Date.now() - t10} ms`);

console.log("Hashing with cost 12:");
const t12 = Date.now();
await bcrypt.hash(password, 12);
console.log(`  took ${Date.now() - t12} ms`);

console.log("\nHigher cost = slower = much harder for hackers to brute-force.");