Feature: Online Checkout
  As a customer
  I want to complete my purchase
  So that I can receive the items I selected

  Background:
    Given the customer is logged in
    And the cart contains at least one item

  Rule: A payment method must be selected before the order can be placed

    Scenario: No payment method selected
      Given the cart contains 3 items
      And no payment method is selected
      When the customer clicks "Place Order"
      Then the system shows "Please select a payment method"
      And the order is not submitted

    Scenario: Credit card selected
      Given the cart contains 1 item
      And the customer has selected credit card
      When the customer clicks "Place Order"
      Then the system proceeds to payment processing

  Rule: Items with insufficient stock must be flagged before checkout

    Scenario: More items than available stock
      Given the cart contains 5 units of "Widget X"
      And only 2 units are in stock
      When the customer views the checkout page
      Then a warning shows "Only 2 units of Widget X available"
      And the quantity is highlighted in red

  Rule: The customer must provide a valid shipping address before confirming the order

    Scenario: Empty shipping address
      Given the customer has no saved address
      And the shipping address fields are empty
      When the customer clicks "Place Order"
      Then the system highlights the address fields
      And shows "Shipping address is required"

    Scenario: Postal code mismatch
      Given the customer enters a postal code that does not match the selected country
      When the customer clicks "Place Order"
      Then the system shows "Postal code does not match the selected country"
      And the order is not submitted

    Scenario: Saved default address
      Given the customer has a saved default address
      When the customer views the checkout page
      Then the shipping address fields are pre-filled
      And the customer can proceed without re-entering the address
