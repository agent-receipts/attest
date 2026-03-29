#!/usr/bin/env node

/**
 * E2E setup script for testing attest-proxy with Claude Desktop.
 *
 * Generates Ed25519 key pair, builds the project, and prints
 * the Claude Desktop MCP config snippet to add.
 */

import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const E2E_DIR = resolve(import.meta.dirname);
const PROJECT_ROOT = resolve(E2E_DIR, "..");
const DATA_DIR = resolve(E2E_DIR, "data");

// Create data directory
if (!existsSync(DATA_DIR)) {
	mkdirSync(DATA_DIR, { recursive: true });
}

// Generate key pair
const keyPath = resolve(DATA_DIR, "private.pem");
const pubKeyPath = resolve(DATA_DIR, "public.pem");

if (!existsSync(keyPath)) {
	const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
		publicKeyEncoding: { type: "spki", format: "pem" },
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
	});
	writeFileSync(keyPath, privateKey);
	writeFileSync(pubKeyPath, publicKey);
	console.log("Generated Ed25519 key pair:");
	console.log(`  Private: ${keyPath}`);
	console.log(`  Public:  ${pubKeyPath}`);
} else {
	console.log("Key pair already exists, skipping generation.");
}

const dbPath = resolve(DATA_DIR, "receipts.db");
const taxonomyPath = resolve(E2E_DIR, "taxonomy.json");
const serverPath = resolve(E2E_DIR, "sample-server.mjs");
const proxyPath = resolve(PROJECT_ROOT, "dist", "proxy", "main.js");

// Print Claude Desktop config
const mcpConfig = {
	"attest-sample": {
		command: "node",
		args: [
			proxyPath,
			"--db",
			dbPath,
			"--taxonomy",
			taxonomyPath,
			"--key",
			keyPath,
			"--issuer",
			"did:agent:claude-desktop",
			"--principal",
			"did:user:local",
			"node",
			serverPath,
		],
	},
};

console.log("\n--- Claude Desktop MCP Config ---");
console.log(
	"Add this to your claude_desktop_config.json under 'mcpServers':\n",
);
console.log(JSON.stringify(mcpConfig, null, 2));
console.log("\n--- Paths ---");
console.log(`Database:  ${dbPath}`);
console.log(`Taxonomy:  ${taxonomyPath}`);
console.log(`Server:    ${serverPath}`);
console.log(`Proxy:     ${proxyPath}`);

console.log("\n--- After testing, verify with ---");
console.log(
	`node ${resolve(PROJECT_ROOT, "dist", "cli", "main.js")} list --db ${dbPath}`,
);
console.log(
	`node ${resolve(PROJECT_ROOT, "dist", "cli", "main.js")} verify <chain-id> --key ${pubKeyPath} --db ${dbPath}`,
);
