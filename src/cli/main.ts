#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { openStore } from "@attest-protocol/attest-ts";
import { runExport } from "./export.js";
import { runInspect } from "./inspect.js";
import { runList } from "./list.js";
import { runStats } from "./stats.js";
import { runVerify } from "./verify.js";

const USAGE = `Usage: attest <command> [options]

Commands:
  list      List receipts with optional filters
  inspect   Show receipt details
  export    Export a chain as JSON
  verify    Verify chain integrity
  stats     Show store summary statistics

Global options:
  --db <path>     Path to receipts database (default: receipts.db)
  --help          Show this help message

Run 'attest <command> --help' for command-specific options.`;

const LIST_USAGE = `Usage: attest list [options]

Options:
  --chain <id>       Filter by chain ID
  --action <type>    Filter by action type
  --risk <level>     Filter by risk level (low, medium, high, critical)
  --status <status>  Filter by status (success, failure, pending)
  --after <time>     Filter receipts after timestamp (ISO 8601)
  --before <time>    Filter receipts before timestamp (ISO 8601)
  --limit <n>        Maximum number of results
  --json             Output as JSON
  --watch <secs>     Re-run every N seconds (default: 2)
  --db <path>        Path to receipts database (default: receipts.db)`;

const STATS_USAGE = `Usage: attest stats [options]

Options:
  --json          Output as JSON
  --db <path>     Path to receipts database (default: receipts.db)`;

const INSPECT_USAGE = `Usage: attest inspect <receipt-id> [options]

Options:
  --key <path>    Public key file (PEM) for signature verification
  --json          Output as JSON
  --db <path>     Path to receipts database (default: receipts.db)`;

const EXPORT_USAGE = `Usage: attest export <chain-id> [options]

Options:
  --db <path>     Path to receipts database (default: receipts.db)`;

const VERIFY_USAGE = `Usage: attest verify <chain-id> [options]

Options:
  --key <path>    Public key file (PEM) for signature verification (required)
  --json          Output as JSON
  --db <path>     Path to receipts database (default: receipts.db)`;

function main(): void {
	const args = process.argv.slice(2);
	const command = args[0];

	if (!command || command === "--help" || command === "-h") {
		console.log(USAGE);
		process.exit(0);
	}

	const commandArgs = args.slice(1);

	switch (command) {
		case "list":
			handleList(commandArgs);
			break;
		case "inspect":
			handleInspect(commandArgs);
			break;
		case "export":
			handleExport(commandArgs);
			break;
		case "verify":
			handleVerify(commandArgs);
			break;
		case "stats":
			handleStats(commandArgs);
			break;
		default:
			console.error(`Unknown command: ${command}\n`);
			console.error(USAGE);
			process.exit(1);
	}
}

function handleList(args: string[]): void {
	const { values } = parseArgs({
		args,
		options: {
			chain: { type: "string" },
			action: { type: "string" },
			risk: { type: "string" },
			status: { type: "string" },
			after: { type: "string" },
			before: { type: "string" },
			limit: { type: "string" },
			json: { type: "boolean", default: false },
			watch: { type: "string" },
			db: { type: "string", default: "receipts.db" },
			help: { type: "boolean", default: false },
		},
	});

	if (values.help) {
		console.log(LIST_USAGE);
		return;
	}

	const listOptions = {
		chainId: values.chain,
		actionType: values.action,
		riskLevel: values.risk,
		status: values.status,
		after: values.after,
		before: values.before,
		limit: values.limit ? Number(values.limit) : undefined,
		json: values.json,
	};

	if (values.watch !== undefined) {
		const interval = (Number(values.watch) || 2) * 1000;
		const store = openStore(values.db ?? "receipts.db");
		const tick = () => {
			console.clear();
			console.log(runList(store, listOptions));
		};
		tick();
		setInterval(tick, interval);
		return; // keep process alive
	}

	const store = openStore(values.db ?? "receipts.db");
	try {
		console.log(runList(store, listOptions));
	} finally {
		store.close();
	}
}

function handleInspect(args: string[]): void {
	const { values, positionals } = parseArgs({
		args,
		options: {
			key: { type: "string" },
			json: { type: "boolean", default: false },
			db: { type: "string", default: "receipts.db" },
			help: { type: "boolean", default: false },
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(INSPECT_USAGE);
		return;
	}

	const receiptId = positionals[0];
	if (!receiptId) {
		console.error("Error: receipt ID is required.\n");
		console.error(INSPECT_USAGE);
		process.exit(1);
	}

	const publicKey = values.key ? readFileSync(values.key, "utf-8") : undefined;

	const store = openStore(values.db ?? "receipts.db");
	try {
		const output = runInspect(store, receiptId, {
			publicKey,
			json: values.json,
		});
		console.log(output);
	} finally {
		store.close();
	}
}

function handleExport(args: string[]): void {
	const { values, positionals } = parseArgs({
		args,
		options: {
			db: { type: "string", default: "receipts.db" },
			help: { type: "boolean", default: false },
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(EXPORT_USAGE);
		return;
	}

	const chainId = positionals[0];
	if (!chainId) {
		console.error("Error: chain ID is required.\n");
		console.error(EXPORT_USAGE);
		process.exit(1);
	}

	const store = openStore(values.db ?? "receipts.db");
	try {
		const output = runExport(store, chainId);
		console.log(output);
	} finally {
		store.close();
	}
}

function handleVerify(args: string[]): void {
	const { values, positionals } = parseArgs({
		args,
		options: {
			key: { type: "string" },
			json: { type: "boolean", default: false },
			db: { type: "string", default: "receipts.db" },
			help: { type: "boolean", default: false },
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(VERIFY_USAGE);
		return;
	}

	const chainId = positionals[0];
	if (!chainId) {
		console.error("Error: chain ID is required.\n");
		console.error(VERIFY_USAGE);
		process.exit(1);
	}

	if (!values.key) {
		console.error("Error: --key is required for verification.\n");
		console.error(VERIFY_USAGE);
		process.exit(1);
	}

	const publicKey = readFileSync(values.key, "utf-8");

	const store = openStore(values.db ?? "receipts.db");
	try {
		const output = runVerify(store, chainId, publicKey, {
			json: values.json,
		});
		console.log(output);
	} finally {
		store.close();
	}
}

function handleStats(args: string[]): void {
	const { values } = parseArgs({
		args,
		options: {
			json: { type: "boolean", default: false },
			db: { type: "string", default: "receipts.db" },
			help: { type: "boolean", default: false },
		},
	});

	if (values.help) {
		console.log(STATS_USAGE);
		return;
	}

	const store = openStore(values.db ?? "receipts.db");
	try {
		const output = runStats(store, { json: values.json });
		console.log(output);
	} finally {
		store.close();
	}
}

main();
