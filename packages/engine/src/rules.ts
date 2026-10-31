import ts from "typescript";
import type {
  EvidenceRef,
  FileDetail,
  Finding,
  SourceResolution,
} from "@vajra/contracts";
import { stableId } from "./snapshot.js";
interface Signal {
  kind: "network" | "execute" | "sensitive" | "dynamic";
  line: number;
  key: string;
}
export function signals(text: string, path: string): Signal[] {
  const sf = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.JS,
  );
  const result: Signal[] = [];
  const imports = new Map<string, string>();
  const normalize = (v: string) => v.replace(/^node:/, "");
  function moduleOf(node: ts.Node): string | undefined {
    if (ts.isIdentifier(node)) return imports.get(node.text);
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      return normalize(node.arguments[0].text);
    return undefined;
  }
  function bindings(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const mod = normalize(node.moduleSpecifier.text);
      const clause = node.importClause;
      if (clause?.name) imports.set(clause.name.text, mod);
      const b = clause?.namedBindings;
      if (b && ts.isNamespaceImport(b)) imports.set(b.name.text, mod);
      if (b && ts.isNamedImports(b))
        for (const e of b.elements)
          imports.set(
            e.name.text,
            `${mod}:${e.propertyName?.text ?? e.name.text}`,
          );
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const mod = moduleOf(node.initializer);
      if (mod && ts.isIdentifier(node.name)) imports.set(node.name.text, mod);
      if (mod && ts.isObjectBindingPattern(node.name))
        for (const e of node.name.elements)
          if (ts.isIdentifier(e.name))
            imports.set(
              e.name.text,
              `${mod}:${e.propertyName?.getText(sf) ?? e.name.text}`,
            );
    }
    ts.forEachChild(node, bindings);
  }
  bindings(sf);
  function add(kind: Signal["kind"], node: ts.Node) {
    result.push({
      kind,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      key: kind + ":" + node.getText(sf).replace(/\s+/g, " "),
    });
  }
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const ex = node.expression;
      let target = ex.getText(sf);
      if (ts.isIdentifier(ex) && imports.has(ex.text))
        target = imports.get(ex.text)!;
      if (ts.isPropertyAccessExpression(ex))
        target =
          (moduleOf(ex.expression) ?? ex.expression.getText(sf)) +
          ":" +
          ex.name.text;
      if (
        /^(fetch|https?:(request|get)|axios(?::\w+)?|undici:(fetch|request))$/.test(
          target,
        )
      )
        add("network", node);
      if (
        /^child_process:(exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)$/.test(
          target,
        )
      )
        add("execute", node);
      if (
        target === "eval" ||
        target === "Function" ||
        /^vm:(runInNewContext|runInThisContext|runInContext)$/.test(target)
      )
        add("dynamic", node);
      if (
        /^fs:(readFile|readFileSync|createReadStream)$/.test(target) &&
        /\.ssh|\.npmrc|credentials|\.aws|\.env/.test(node.getText(sf))
      )
        add("sensitive", node);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      node.expression.getText(sf) === "process.env"
    )
      add("sensitive", node);
    if (
      ts.isElementAccessExpression(node) &&
      node.expression.getText(sf) === "process.env"
    )
      add("sensitive", node);
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return result;
}
export function evidence(
  detail: FileDetail,
  side: "package" | "source",
  line?: number,
): EvidenceRef {
  const text = side === "package" ? detail.packageText : detail.sourceText;
  if (line !== undefined && text !== null) {
    const excerpt = text.split("\n")[line - 1] ?? "";
    return {
      fileId: detail.file.id,
      side,
      startLine: line,
      endLine: line,
      ...(excerpt.length <= 8192 ? { excerpt } : {}),
    };
  }
  return { fileId: detail.file.id, side };
}
function manifest(text: string | null): Record<string, unknown> | null {
  try {
    const m: unknown = JSON.parse(text ?? "");
    return m && typeof m === "object" && !Array.isArray(m)
      ? (m as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
function lineFor(text: string, key: string): number {
  return Math.max(
    1,
    text.split("\n").findIndex((l) => l.includes(JSON.stringify(key))) + 1,
  );
}
function object(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
export function runRules(
  details: FileDetail[],
  source: SourceResolution,
  relocations: Map<string, string>,
): Finding[] {
  const findings: Finding[] = [];
  const config = details.find((d) => d.file.sourcePath === "package.json");
  const srcManifest = manifest(config?.sourceText ?? null);
  const validSource = source.method !== "unresolved";
  const declaredOutputs = new Set<string>();
  function collectOutputs(value: unknown): void {
    if (typeof value === "string")
      declaredOutputs.add(value.replace(/^\.\//, ""));
    else if (Array.isArray(value)) value.forEach(collectOutputs);
    else if (value && typeof value === "object")
      Object.values(value).forEach(collectOutputs);
  }
  collectOutputs(srcManifest?.main);
  collectOutputs(srcManifest?.module);
  collectOutputs(srcManifest?.exports);
  const hasBuild = typeof object(srcManifest?.scripts).build === "string";
  const add = (
    d: FileDetail,
    ruleId: string,
    title: string,
    explanation: string,
    severity: Finding["severity"],
    classification: Finding["classification"],
    refs: EvidenceRef[],
    limitations: string[] = [],
  ) => {
    findings.push({
      id: stableId(
        "finding",
        ruleId + ":" + d.file.id + ":" + JSON.stringify(refs),
      ),
      ruleId,
      title,
      explanation,
      severity,
      classification,
      confidence: validSource && source.confidence !== "low" ? "high" : "low",
      origin: "rule",
      evidence: refs,
      limitations: [...source.limitations, ...limitations],
    });
  };
  for (const d of details) {
    const f = d.file;
    const side = f.packagePath ? "package" : "source";
    const ref = evidence(d, side);
    if (f.status === "identical") {
      if (relocations.has(f.id))
        add(
          d,
          "relocated_exact",
          "Relocated file has identical bytes",
          relocations.get(f.id)!,
          "info",
          "exact_match",
          [evidence(d, "package"), evidence(d, "source")],
        );
      continue;
    }
    if (!validSource) {
      add(
        d,
        "source_unresolved",
        "No reliable source comparison",
        "Source identity could not be established; this file cannot be characterized as a published-only modification.",
        "info",
        "unresolved",
        [ref],
      );
      continue;
    }
    if (f.status === "skipped") {
      add(
        d,
        "inspection_incomplete",
        "File requires additional inspection",
        "Changed file could not be fully inspected within supported text and processing limits.",
        "info",
        "unresolved",
        [ref],
      );
      continue;
    }
    if (f.status === "removed") {
      const files = srcManifest?.files;
      // Only literal include paths are supported. Globs/negations require fuller npm packaging semantics.
      if (
        config &&
        Array.isArray(files) &&
        files.length > 0 &&
        files.every((p) => typeof p === "string" && !/[*!?\[\]{}]/.test(p)) &&
        !files.some(
          (p) =>
            f.sourcePath === p ||
            f.sourcePath?.startsWith(String(p).replace(/\/$/, "") + "/"),
        ) &&
        !/^(package\.json|readme|licen[cs]e|notice)(\.|$)/i.test(
          f.sourcePath ?? "",
        ) &&
        f.sourcePath !== srcManifest?.main
      ) {
        add(
          d,
          "packaging_files",
          "Source file is outside declared package contents",
          "The source package.json files list does not include this path. This explains an omission, not the integrity of included files.",
          "info",
          "explained_packaging",
          [
            evidence(d, "source"),
            evidence(config, "source", lineFor(config.sourceText!, "files")),
          ],
        );
      } else
        add(
          d,
          "source_omission",
          "Source file is absent from package",
          "Packaging may intentionally omit source files; no supported packaging rule establishes this omission.",
          "info",
          "unresolved",
          [ref],
        );
      continue;
    }
    if (f.packagePath === "package.json") {
      const pm = manifest(d.packageText);
      const sm = manifest(d.sourceText);
      if (!pm) {
        add(
          d,
          "invalid_manifest",
          "Package manifest is not valid JSON",
          "Cannot analyze package metadata.",
          "medium",
          "unresolved",
          [ref],
        );
        continue;
      }
      for (const hook of ["preinstall", "install", "postinstall", "prepare"]) {
        const next = object(pm.scripts)[hook],
          previous = object(sm?.scripts)[hook];
        if (typeof next === "string" && next !== previous) {
          const risky =
            /\b(curl|wget|powershell|Invoke-WebRequest)\b|\beval\b|https?:\/\//i.test(
              next,
            );
          add(
            d,
            "lifecycle_change",
            "Published lifecycle script differs",
            `The ${hook} lifecycle command was added or changed in the published manifest. Review when this hook runs before installation.`,
            risky ? "high" : "medium",
            "suspicious_change",
            [
              evidence(d, "package", lineFor(d.packageText!, hook)),
              ...(sm ? [evidence(d, "source")] : []),
            ],
            [
              "Lifecycle commands may be legitimate; this is not proof of malicious intent.",
            ],
          );
        }
      }
    }
    if (/\.(?:[cm]?js|jsx|tsx?|sh|ps1)$/i.test(f.packagePath ?? "")) {
      if (
        f.status === "added" &&
        hasBuild &&
        declaredOutputs.has(f.packagePath!) &&
        config
      ) {
        add(
          d,
          "declared_build_output",
          "Declared build output lacks direct source match",
          "Source metadata declares this entry point and a build command. It may be generated; source equivalence remains unverified and behavior checks still apply.",
          "info",
          "generated_unverified",
          [ref, evidence(config, "source")],
        );
      } else if (f.status === "added")
        add(
          d,
          "published_executable",
          "Executable source exists only in package",
          "Review code that is absent from the selected source tree. It may be generated, but equivalence has not been established.",
          "medium",
          "suspicious_change",
          [ref],
        );
      if (d.packageText !== null) {
        const before = new Map<string, number>();
        for (const s of signals(d.sourceText ?? "", f.sourcePath ?? ""))
          before.set(s.key, (before.get(s.key) ?? 0) + 1);
        const introduced = signals(d.packageText, f.packagePath!).filter(
          (s) => {
            const n = before.get(s.key) ?? 0;
            if (n) {
              before.set(s.key, n - 1);
              return false;
            }
            return true;
          },
        );
        for (const sig of introduced) {
          const combination =
            introduced.some((s) => s.kind === "network") &&
            introduced.some(
              (s) => s.kind === "execute" || s.kind === "sensitive",
            );
          add(
            d,
            "introduced_" + sig.kind,
            "Introduced " + sig.kind + " behavior",
            "A call or access not present in the compared source was observed in the published code. Review its purpose and data flow.",
            combination ? "high" : "medium",
            "suspicious_change",
            [evidence(d, "package", sig.line)],
            [
              "Static syntactic signal; runtime reachability, aliases, and malicious intent are not established.",
            ],
          );
        }
      }
    }
    const build = object(srcManifest?.scripts).build;
    if (
      config &&
      typeof build === "string" &&
      /(?:^|\/)(?:dist|lib|build)\/|\.min\.js$/.test(f.packagePath ?? "")
    ) {
      add(
        d,
        "generated_candidate",
        "Possible generated build output",
        "The file path resembles a build output and source declares a build command. These facts do not prove source equivalence.",
        "info",
        "generated_unverified",
        [ref, evidence(config, "source", lineFor(config.sourceText!, "build"))],
      );
    }
    if (!findings.some((x) => x.evidence.some((e) => e.fileId === f.id)))
      add(
        d,
        "unexplained_difference",
        "Unexplained package difference",
        "The artifact differs from its selected source. No supported deterministic explanation establishes why.",
        "low",
        "unresolved",
        [ref, ...(f.sourcePath ? [evidence(d, "source")] : [])],
      );
  }
  return [...new Map(findings.map((f) => [f.id, f])).values()];
}
