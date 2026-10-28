# Unit Price Tags

A Chrome extension that adds price-per-unit tags (per ounce, pound, liter, item...) to grocery sites, so you can actually compare what's cheaper. It also lets you **sort search results by unit price**, which even Amazon doesn't let you do.

## What it does

- **Unit price next to every price.** A small yellow tag like **$0.08/fl oz** shows up beside each product's price.
- **Sort by unit price.** A button in the bottom left puts the cheapest-per-unit items first, and the cheapest one's tag turns green. Click it again to go back to the normal order. It shows up when a page has 3 or more tags.
- **Sensible units.** Eggs are priced per dozen. Paper towels, protein bars, sponges, trash bags and other by-the-piece stuff are priced per item, not per pound.
- **Uses the store's own number when there is one.** If a site already shows a unit price (Amazon often does), that's used, since it accounts for things like "Pack of 6."
- **Your units, your format.**
  - Solids: oz, lb, g, 100 g, kg
  - Liquids: fl oz, L, 100 mL, qt, gal
  - Write it as dollars ($0.08) or cents (8¢)
  - Round to 0.01, 0.001 or 0.0001
- **On/off per site,** right from the popup.
- **Right-click fallback.** No tag on something? Highlight the price and the size, right-click, and pick **Unit price for this**.

## Works on

Aldi, Target, Walmart, Publix, Instacart, Costco, Sam's Club, Kroger, Whole Foods, H-E-B, Wegmans, Sprouts, Stop & Shop, BJ's and Amazon. The right-click option works on any site.

## Install

1. Click the green **Code** button at the top of this page, then **Download ZIP**, and unzip it.
2. Go to `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the unzipped folder.
4. Open a grocery site. Click the extension icon to pick your units.

## Privacy

Everything runs in your browser. It reads prices and sizes off the page you're on, does the math locally, and saves your settings in Chrome. No account, no tracking, and nothing is sent anywhere.

It asks to run on all sites only so the right-click option works anywhere. Tags only show on the stores listed above (or ones you turn on).

## Good to know

- **Liquids and solids don't mix.** Fluid ounces measure volume and ounces measure weight, so they can't be compared. When sorting, the odd ones out go after the main group.
- **Sorting covers what's loaded.** It sorts the products on the page you're looking at, not the store's whole catalog.

## More extensions by me

- [Extensious](https://github.com/PocroLoco/Extensious): turn Chrome extensions on and off in groups (profiles), with drag and drop.
- [Gas Money](https://github.com/PocroLoco/Gas-Money): see what a Google Maps drive costs you in gas, right under each route.

## License

MIT. See [LICENSE](LICENSE).
