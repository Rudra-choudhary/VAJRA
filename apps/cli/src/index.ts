#!/usr/bin/env node
import { parseArgs } from "node:util";

const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === "analyze") {
  console.log("analyze: requires ingestion (owner B). Not available yet.");
  process.exit(2);
} else if (cmd === "watch") {
  console.log("watch: not implemented yet.");
  process.exit(2);
} else if (cmd === "monitor") {
  console.log("monitor --once: not implemented yet.");
  process.exit(2);
} else {
  console.log("Usage: vajra analyze|watch|monitor");
  process.exit(2);
}