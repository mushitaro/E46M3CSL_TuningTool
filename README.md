# MSS54HP CSL CONVERT /// TUNER

## Overview

This application integrates the various tuning processes for the E46 M3 CSL Conversion currently shared in the community into a single, streamlined workflow.

The method is based on the [methodology shared on NA M3 Forums](https://nam3forum.com/forums/forum/special-interests/coding-tuning/242281-a-quick-and-easy-way-to-street-tune-your-csl-conversion-for-drivability).

First of all, I would like to express my gratitude to everyone who contributes daily to the research and publication of the CSL CONVERT tuning methodology.

### Integrated Processes

The tool automates and combines the following steps:

1. **Disabling MAP & LTFT compensation** (replacing TunerPro steps)
2. **RO (Relative Air Mass) Correction** (replacing AQ_REL to AQ_REL_ALPHA_N Logfile Converter)
3. **Lambda Value Aggregation** (replacing MegaLogViewer)
4. **Tuning VE Calculation** (replacing "VE Tuning With Lambda Integrators" spreadsheet)
5. **VE Comparison vs. Stock CSL**
6. **VE Table Editing** (replacing manual hex editing)
7. **Re-enabling MAP & LTFT compensation**

In short, the previously labor-intensive process is now streamlined: simply upload your **Partial BIN** and **TESTO LOG CSV**, click the **BIN** download button, and the process is complete.

(The tool is completely free.)

## Usage

The app is hosted on GitHub Pages, so it can be used immediately without installation:
**[https://mss54hp-csl-convert-tuner.tsunagi.app/](https://mss54hp-csl-convert-tuner.tsunagi.app/)**

The source code is public, so please feel free to review or modify it:
[https://github.com/mushitaro/mss54hp-csl-convert-tuner/](https://github.com/mushitaro/mss54hp-csl-convert-tuner/)

## Technical Specifications & Limitations

- **Supported BINs**: Currently only tested with **0401 partial BINs**.
- **CSV Formats**: Supports semicolon-delimited (Testo output) and comma-separated (Spreadsheet output).
- **Headers**: CSV Header names must match Testo output EXACTLY.
- **Accuracy**: Calculations have been verified against manual tools at the cell level and confirmed to match perfectly.
- **Checksums**: A checksum correction feature is **not yet included**. Please correct checksums using standard tools before flashing if necessary (though partial writes often bypass this need depending on the tool).
- **Compatibility**: Tested on Chrome and Edge. Operation on Safari or Firefox is not guaranteed.
- **Flashing**: Ideally, I would like to integrate Testo and flashing tools directly, but I am still researching that logic. If anyone can provide information on this, I would love to try and integrate it.

## Important Note on Development

This application was developed entirely using **Gemini (LLM)**; there has been **no manual code review by a human**.
As a result, there may be unexpected bugs or redundant "spaghetti" code in some places. I have left some of the redundant code as-is to preserve logic integrity.

**Disclaimer:** Use this tool at your own risk. The author assumes no responsibility for any damage to your ECU or engine.

---

## Development (Local)

This is a [Next.js](https://nextjs.org) project.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
