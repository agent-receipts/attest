#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { generateKeyPair } from "../receipt/signing.js";
import { openStore } from "../store/store.js";
import { loadTaxonomyConfig } from "../taxonomy/config.js";
import { ReceiptEmitter } from "./emitter.js";
import { ToolCallInterceptor } from "./interceptor.js";
import { McpProxy } from "./proxy.js";

const USAGE = `Usage: attest-proxy [options] -- <command> [args...]

Transparent MCP STDIO proxy that records tool calls as signed receipts.

Options:
  --taxonomy <path>   Taxonomy config file (JSON) for tool→action mapping
  --db <path>         Receipt database path (default: receipts.db)
  --key <path>        Ed25519 private key file (PEM). If omitted, generates a
                      temporary key pair and prints the public key to stderr.
  --issuer <did>      Issuer DID (default: did:agent:attest-proxy)
  --principal <did>   Principal DID (default: did:user:unknown)
  --chain <id>        Chain ID (default: auto-generated)
  --help              Show this help message

Example:
  attest-proxy --db receipts.db --taxonomy taxonomy.json -- node server.mjs`;

function main(): void {
	const { values, positionals } = parseArgs({
		options: {
			taxonomy: { type: "string" },
			db: { type: "string", default: "receipts.db" },
			key: { type: "string" },
			issuer: { type: "string", default: "did:agent:attest-proxy" },
			principal: { type: "string", default: "did:user:unknown" },
			chain: { type: "string" },
			help: { type: "boolean", default: false },
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(USAGE);
		process.exit(0);
	}

	const command = positionals[0];
	if (!command) {
		console.error("Error: server command is required.\n");
		console.error(USAGE);
		process.exit(1);
	}

	const serverArgs = positionals.slice(1);

	// Load or generate key
	let privateKey: string;
	let verificationMethod: string;
	if (values.key) {
		privateKey = readFileSync(values.key, "utf-8");
		verificationMethod = `${values.issuer}#key-1`;
	} else {
		const keys = generateKeyPair();
		privateKey = keys.privateKey;
		verificationMethod = `${values.issuer}#ephemeral`;
		console.error(
			"[attest-proxy] No --key provided, generated ephemeral key pair.",
		);
		console.error(`[attest-proxy] Public key:\n${keys.publicKey}`);
	}

	// Load taxonomy mappings
	const mappings = values.taxonomy ? loadTaxonomyConfig(values.taxonomy) : [];

	// Open store
	const store = openStore(values.db ?? "receipts.db");

	// Wire up proxy → interceptor → emitter
	const proxy = new McpProxy(command, serverArgs);
	const interceptor = new ToolCallInterceptor();
	const emitter = new ReceiptEmitter({
		privateKey,
		verificationMethod,
		issuer: { id: values.issuer ?? "did:agent:attest-proxy" },
		principal: { id: values.principal ?? "did:user:unknown" },
		store,
		mappings,
		chainId: values.chain,
	});

	interceptor.attach(proxy);
	emitter.attach(interceptor);

	proxy.on("error", (err) => {
		console.error(`[attest-proxy] ${err.message}`);
	});

	proxy.on("close", (code) => {
		console.error(
			`[attest-proxy] Server exited (code ${code}). ${emitter.getSequence()} receipts emitted to chain ${emitter.getChainId()}.`,
		);
		store.close();
		process.exit(code ?? 0);
	});

	proxy.start();

	console.error(
		`[attest-proxy] Proxying ${command} ${serverArgs.join(" ")}. Chain: ${emitter.getChainId()}, DB: ${values.db ?? "receipts.db"}`,
	);
}

main();
