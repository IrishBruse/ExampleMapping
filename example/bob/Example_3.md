---
Author: bob
Type: Example
ID: Example_3
Time: 2026-03-31T09:30:00.000Z
Rules: Rule_2
---
# Example
Given the cart contains 5 units of "Widget X"
And only 2 units are in stock
When the customer views the checkout page
Then a warning shows "Only 2 units of Widget X available"
And the quantity is highlighted in red
