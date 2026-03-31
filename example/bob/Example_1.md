---
Author: bob
Type: Example
ID: Example_1
Time: 2026-03-31T09:25:00.000Z
Rules: Rule_1
---
# Example
Given the cart contains 3 items
And no payment method is selected
When the customer clicks "Place Order"
Then the system shows "Please select a payment method"
And the order is not submitted
