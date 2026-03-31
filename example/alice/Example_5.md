---
Author: alice
Type: Example
ID: Example_5
Time: 2026-03-31T09:35:00.000Z
Source: ai
Rules: Rule_3
---
# Example
Given the customer enters a postal code that does not match the selected country
When the customer clicks "Place Order"
Then the system shows "Postal code does not match the selected country"
And the order is not submitted
