# P1-19c: rupee amounts in the engine gate (brief annex)

Written by the advisor at the P1-19d final check (2026-11-20). SOURCE is the `honest-lines.mjs` fixture: "Handled budgets of ₹2 crore", with 4 analysts.

The "From" column gives where each row came from:
- C: the seven acceptance criteria.
- S: the earlier rupee scope.
- W: the P1-19d worker's open list.
- D: an example the advisor derived for a criterion.

Accepted exception at the P1-19d merge: lakh and crore money can back a count noun one filler word further away than main allowed (B9). P1-19c closes it.

## Must pass

| # | Line | Source | From |
|---|---|---|---|
| 1–7 | "Handled 2 crore budgets", "Handled ₹ 2 crore budgets", "Handled 2 Cr budgets", "Handled 2cr budgets", "Handled a 2 crore budget", "Managed 2 crore worth of budgets", "Managed budgets totalling 2 crore annually" | SOURCE | known false blocks (the KNOWN_FALSE_BLOCKS_PENDING_P1_19C test must flip to pass) |
| 8 | Handled 2 crore budgets | Handled ₹2 crore budgets for 300 customers | known false blocks |
| 9 | Handled 2 crore budgets | Managed a team of 4 analysts, handled budgets of ₹2 crore | known false blocks |
| 10 | Handled 2 crore budgets | Budget: ₹2 crore | C (a label backs its amount) |
| 11 | Handled 2 crore budgets | FY23 budgets of ₹2 crore | C (digits glued to text are not counters) |
| 12 | Handled 2 crore budgets | Q3 budgets of ₹2 crore for B2B | C (digits glued to text) |
| 13 | Handled 2 crore budgets | "- Handled budgets of\n  ₹2 crore" | S (wrapped bullets) |
| 14 | Served 10k customers | "- Served 10,000\n  customers" | S (wrapped bullets) |
| 15 | Served 1 lakh users | Served 1,00,000 users | S (Indian digit grouping) |
| 16 | Handled budgets of ₹2,00,00,000 | SOURCE | S |
| 17 | Earned ₹2 crore from customers | Earned ₹2 crore in revenue from 300 customers | D (a ₹-marked amount in the tailored line is money, never a count claim) |
| 18 | Handled 2 crore budgets | Handled 2 crore budgets | C (what works keeps working) |
| 19 | The 116 honest lines plus 4 extras; self-test passes; 1,500-amount cost test stays under 500 ms; warm×3 ≤ cold holds | SOURCE | C |

## Must block

| # | Line | Source | From |
|---|---|---|---|
| B1 | Handled budgets of ₹20 crore | SOURCE | S, W |
| B2 | Handled budgets of Rs 20 lakh | SOURCE | S |
| B3 | Handled budgets of ₹20,00,000 | SOURCE | S |
| B4 | Served 2 crore customers | Earned ₹2 crore from customers (also with "Rs 2 crore" and "₹ 2 crore") | W |
| B5 | Handled 2 crore budgets, read as a count | Handled ₹ 2 crore budgets | W (spaced ₹ mark) |
| B6 | Served 2 crore customers | Budget of 2 crore rupees for customers | S (trailing "rupees") |
| B7 | Served 20M customers | Budget of 2 crore rupees for customers | rewording a money amount as a count |
| B8 | Served 20 lakh customers | Earned 2 million dollars from customers | rewording a money amount as a count |
| B9 | Served 2 crore customers | Closed ₹2 crore in revenue with enterprise customers | reach exception accepted at the P1-19d merge |
| B10 | Served 2 million customers | Closed $2 million in revenue with enterprise customers | same hole for other currencies (in scope: fix it the same way) |
| B11 | Served 2 crore customers | "Budget: ₹2 crore\nCustomers served daily" | D (line break is a stop) |
| B12 | Served 2 crore customers | Served 2019 customers, handled budgets of ₹2 crore | C (year-shaped numbers) |
| B13 | Served 2.02k customers | Analyst since 2020 customers were served | C (year-shaped numbers) |
| B14 | Handled 2 crore customers | Handled budgets of ₹2 crore, customers across India | C (a comma is a stop) |
| B15 | Managed 2 crore analysts | Managed a team of 4 senior finance analysts on ₹2 crore | C (the count window reaches the noun) |
| B16 | Managed 2 crore analysts | Managed four analysts, ₹2 crore | C (spelled-out numbers) |
| B17 | Managed 2 crore analysts | Led four analysts handling ₹2 crore | C (spelled-out numbers) |
| B18 | Managed 2 crore customers; Handled 20 crore budgets; Handled 2 lakh budgets; Managed 20 crore worth of budgets; Sold 2 crore worth of software licences; Earned 2 crore annually; Processed 2 crore monthly invoices | SOURCE | keep blocking |
| B19 | Managed 2 crore customers | Handled ₹2 crore budgets for 300 customers | keep blocking |
| B20 | Managed 2 crore analysts | Managed a team of 4 analysts, handled budgets of ₹2 crore | keep blocking |
| B21 | Managed 2 crore analysts | Led 4 analysts handling ₹2 crore | keep blocking |
| B22 | Served 2 crore analysts | Managed 4 analysts with budgets of ₹2 crore | keep blocking |
| B23 | Managed 2 crore vendors | Handled ₹2 crore budgets across the north and south zones with vendors | keep blocking |
| B24 | Served 2 crore customers | Served 2,000 customers on ₹2 crore budgets | keep blocking |

B12 and B14–B17 block today only because the crore-money rule was removed in P1-19d. The rebuilt rule must not reopen them.
