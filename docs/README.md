# Documentation

The studio's design documents: what each one says, and the rules every document follows. The
layout and its rules are the ones drama-cli's documentation uses (short_drama `doc/README.md`),
which merecdesperez44323-lab approved for that repository on 20 October 2026 and asked for here
on 30 October 2026 ("有专业的文档结构，比如 decision啊…每个决策都要有依据…都要是英语，多用 mermaid"; *a professional
document structure, such as decisions… every decision needs grounds… all in English, plenty of
Mermaid*).

## How these docs are organised

- **Content follows arc42** <sup>[1](#ref-1)</sup>: introduction and goals, constraints, context
  and scope, solution strategy, building blocks, runtime, crosscutting concepts, architecture
  decisions, risks, glossary. A file uses the sections its topic needs.
- **Each file is one Diátaxis kind** <sup>[2](#ref-2)</sup>: explanation, reference or how-to,
  never a mix ("Crossing or blurring the boundaries… is at the heart of a vast number of problems
  in documentation").
- **Every explanation says how others solve the problem** <sup>[3](#ref-3)</sup>: what
  established tools and practice do, cited, and why our approach is chosen over it. A how-to and
  a reference carry no explanation, so they have none.
- **Recommended opening of an explanation:** an introduction (what this is and who it is for),
  the problem, and how the industry solves it; then our approach, then the details. It is a
  preference, applied where it fits, not a frame to force a document into. The closest
  established source is a Google design doc's "Context and scope" and "Alternatives considered"
  <sup>[3](#ref-3)</sup>. A how-to opens with a short introduction and the problem; a reference
  with one line saying what it is.
- **One topic per file**, and one folder for the studio's own screens: `docs/studio/`. The
  whole system is in `architecture.md`.
- **Terms are defined once**, in the glossary, and **decisions are logged once**, dated, in
  [decisions.md](decisions.md) (arc42 sections 12 and 9) <sup>[1](#ref-1)</sup>. Other documents
  link them.
- **Every concept cites its source**: a file by its path and line, a decision by its number, a
  publication by its reference. A design of our own says "ours", and why.
- **Quotes are verbatim.** Words in quotation marks are copied exactly from their source; a
  paraphrase stays reported speech. A Chinese quote is followed by an English gloss in italics;
  the gloss is ours, not part of the quote. merecdesperez44323-lab is named by that GitHub id, and
  the app's user is "the maker".
- **Diagrams are Mermaid** <sup>[4](#ref-4)</sup>, in the Markdown itself, so GitHub renders
  them and a change to a diagram shows in a diff.
- **English only.** Chinese appears only inside a verbatim quote and as the UI's Chinese terms.

## Documents

| Document | Kind | Content |
|---|---|---|
| [design-principles.md](design-principles.md) | explanation | the principles every screen and flow follows, each with its source and how others apply it |
| [decisions.md](decisions.md) | reference | the studio's decisions, dated, with their grounds and the words they rest on |
| [CONTRIBUTING.md](CONTRIBUTING.md) | how-to | how to change the studio: where things live, the components, the rules the tests keep |
| [TESTING.md](TESTING.md) | how-to | how the studio is tested, and how to write a test for a change |
| [REUSED.md](REUSED.md) | reference | the files the studio takes from other projects, and their licences |

`PROPOSAL.md`, `IMPLEMENTATION_PLAN.md` and `REDESIGN_PLAN.md` are being folded into these
documents (the glossary, the architecture and the studio's information architecture,
interaction and design system come next), and are deleted when the last of them lands.
`references/` keeps the screenshots of other apps that those documents cite.

The studio's UI itself is designed in [`design/`](../design/), the one source of every screen
([D9](decisions.md#d9-2026-10-30--design-is-the-one-source-of-the-ui)).

## References

<a id="ref-1"></a>[1] G. Starke, P. Hruschka. *arc42*, the template for architecture
documentation. https://docs.arc42.org (CC BY-SA 4.0).

<a id="ref-2"></a>[2] D. Procida. *Diátaxis*, a systematic approach to technical documentation
authoring. https://diataxis.fr; the quotation from https://diataxis.fr/start-here/.

<a id="ref-3"></a>[3] M. Ubl. *Design Docs at Google*, 2020, sections "Context and scope" and
"Alternatives considered". https://www.industrialempathy.com/posts/design-docs-at-google/

<a id="ref-4"></a>[4] *Mermaid*, diagrams from text, and GitHub's rendering of it.
https://mermaid.js.org; https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams
