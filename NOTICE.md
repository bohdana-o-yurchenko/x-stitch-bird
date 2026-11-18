# Notices

## пташечка

Copyright (C) 2026 Bohdana Yurchenko

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General
Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option)
any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
details. You should have received a copy of it along with this program ([`LICENSE`](LICENSE)); if not, see
<https://www.gnu.org/licenses/>.

Source code: <https://github.com/bohdana-o-yurchenko/x-stitch-bird> — linked from the app itself
(☰ ▸ Source code), as section 13 of the licence asks of programs used over a network.

## Included work by others

### Fonts — SIL Open Font License 1.1
- **DM Sans** — Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts).
  `public/fonts/ptashechka-text-*.ttf` are cuts of it; the letters in `public/fonts/ptashechka-symbols.ttf` come from
  it. Licence: [`public/fonts/OFL.txt`](public/fonts/OFL.txt).
- **Onest** — Copyright 2021 The Onest Project Authors (https://github.com/googlefonts/onest). The Cyrillic in
  `public/fonts/ptashechka-text-cyr-*.ttf`. Licence: [`public/fonts/OFL-Onest.txt`](public/fonts/OFL-Onest.txt).
- **DM Sans, Fraunces, Nunito** for the interface are loaded through `next/font` (Google Fonts, OFL 1.1).

### Thread colour data
- **Anchor and Madeira** colour schemes (`src/core/catalog/data/anchor.json`, `madeira.json`, built by
  `scripts/catalog/import-kxstitch.py`) — from KXStitch (https://github.com/KDE/kxstitch, `schemes/`), part of KDE,
  licensed under the GNU General Public License, version 2 or (at your option) any later version; used here under
  its later-version terms, compatible with the AGPL.
- **DMC ↔ Anchor equivalents** — from convertfloss by Luiz Flávio Felizardo (https://github.com/devfel/convertfloss),
  under the MIT License:

  > Copyright (c) 2021 Luiz Flávio Felizardo
  >
  > Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
  > documentation files (the "Software"), to deal in the Software without restriction, including without limitation
  > the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
  > to permit persons to whom the Software is furnished to do so, subject to the following conditions:
  >
  > The above copyright notice and this permission notice shall be included in all copies or substantial portions
  > of the Software.
  >
  > THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
  > THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  > AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
  > CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
  > IN THE SOFTWARE.
- **Preciosa** Rocailles bead codes, finishes and article numbers — from Preciosa Ornela's published sample cards
  (https://www.preciosa-ornela.com/content/files/downloads/Rocailles-Sample-Cards.pdf); the colours were measured
  off the cards' bead photos by `scripts/catalog/import-preciosa.py` and, like any screen colour, are approximations.
- **Mill Hill** bead codes, names and package counts — from Mill Hill's published bead inventory and DMC conversion
  chart; Treasures colours read off the maker's product photos.

### Libraries
Installed from npm under their own licences (MIT, Apache-2.0, BSD, ISC, and LGPL-3.0 for the image library used by
the build) — `pnpm licenses list` shows each. Among them:
- **PDF.js** (`pdfjs-dist`) — Copyright Mozilla Foundation and contributors (https://github.com/mozilla/pdf.js),
  Apache License 2.0. Draws the pages of PDFs added as references; its worker is served with the app.

## Trademarks
DMC, Anchor, Madeira, Mill Hill, Kreinik, Pattern Keeper and the other brand and product names are trademarks of
their owners. Thread codes and names identify the makers' products; on-screen colours are approximations.
пташечка is not affiliated with or endorsed by any of them.
