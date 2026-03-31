---
Author: charlie
Type: Example
ID: Example_4
Time: 2026-03-31T09:33:00.000Z
Source: ai
Rules: Rule_3
---
# Example
Given the customer has no saved address
And the shipping address fields are empty
When the customer clicks "Place Order"
Then the system highlights the address fields
And shows "Shipping address is required"
