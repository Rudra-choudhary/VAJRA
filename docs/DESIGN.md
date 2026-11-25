# VAJRA interface system

## Direction

VAJRA is a package integrity review workspace. Its visual direction is a **release audit ledger**: quiet paper-like surfaces for the report, strong ink for evidence, and restrained teal for navigation and actions. Risk uses familiar red, amber, and blue signals. The interface should feel calm and exact while helping a reviewer move from summary to file, diff, and evidence.

## Product qualities

- Easy to scan
- Trustworthy and explicit about uncertainty
- Dense enough for code review without making body text small

Avoid dark panels, low-contrast metadata, decorative gradients, repeated helper text, and status communicated only by color.

## Tokens

The implementation source is `apps/web/src/index.css`.

| Role | Token | Value |
| --- | --- | --- |
| Page canvas | `--bg-canvas` | `#f3f6fa` |
| Main surface | `--bg-surface` | `#ffffff` |
| Card | `--bg-card` | `#ffffff` |
| Quiet surface | `--bg-card-subtle` | `#f8fafc` |
| Hover surface | `--bg-card-hover` | `#edf3f7` |
| Input surface | `--bg-input` | `#ffffff` |
| Border | `--border-subtle` | `#d7e0e8` |
| Strong border | `--border-medium` | `#8495a3` |
| Action / focus | `--border-active` | `#176b66` |
| Main text | `--text-primary` | `#18252f` |
| Supporting text | `--text-secondary` | `#46596a` |
| Muted text | `--text-muted` | `#586b7b` |
| High severity | `--sev-high` | `#a12626` |
| Medium severity | `--sev-med` | `#854d0e` |
| Low severity | `--sev-low` | `#075985` |
| Informational | `--sev-info` | `#55449b` |
| Success | `--status-success` | `#176b4d` |

## Type and geometry

- Use the system sans-serif stack for interface text and the system monospace stack for paths, hashes, and code.
- Body text is 15px or larger where practical; supporting labels are at least 12px.
- Keep content aligned to a centered maximum width. Use 8px spacing steps, 6/9/12px radii, and visible 1px borders to distinguish working regions.
- Keep a narrower file list beside the main diff at wide widths. Stack them at tablet and phone widths, with file selection before diff and evidence.

## Interaction and accessibility

- All primary actions retain a text label; controls have visible keyboard focus and a clear hover/selected state.
- Pair severity words with color. Never rely on color alone.
- Use a 4.5:1 contrast target for normal text and respect reduced-motion preferences.
- Keep fixture and model limitations visible without repeating the same explanation on every finding.
