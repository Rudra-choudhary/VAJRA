#!/usr/bin/env node
import { parseArgs } from "node:util";

const [cmd, ...rest] = process.argv.slice(2);

function usage() {
  console.log("Usage: vajra analyze|watch|monitor");
  process.exit(2);
}

if (cmd === "analyze") {
  const { values } = parseArgs({ args: rest, options: { name: { type: "string" }, version: { type: "string" } }, strict: false });
  console.log("analyze", values.name, values.version);
  console.log("Note: requires ingestion (owner B); not fully available yet.");
  process.exit(2);
} else if (cmd === "watch") {
  const sub = rest[0];
  if (sub === "add" || sub === "list" || sub === "remove") {
    console.log("watch", sub, rest.slice(1).join(" "));
    process.exit(0);
  }
  usage();
} else if (cmd === "monitor") {
  const { values } = parseArgs({ args: rest, options: { once: { type: "boolean" } }, strict: false });
  if (values.once) {
    console.log("monitor --once: no new releases detected (stub).");
    process.exit(0);
  }
  usage();
} else {
  usage();
}