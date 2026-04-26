class ApprovalSystem:
    def request_approval(self, plan: str) -> bool:
        print("\n==============================")
        print("IMPLEMENTATION PLAN REVIEW")
        print("==============================\n")

        print(plan)

        print("\n==============================")

        choice = input(
            "\nApprove this plan? (yes/no): "
        ).strip().lower()

        return choice == "yes"