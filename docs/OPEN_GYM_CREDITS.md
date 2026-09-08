# openGym Heritage and Credits

`light-weight` owes its core training domain logic to **openGym**.

## What is preserved from openGym:
1. **1RM Calculations**: Epley and Brzycki equations used for strength benchmarking.
2. **Progression Logic**: Standard double progression and percentage-based linear progression.
3. **Session Interpretation**: Calculating total volume (reps × weight), effective sets, and muscle group distribution.
4. **Exercise Categorization**: Primary and secondary muscle activation tagging.

## What is redesigned:
1. **Persistence**: Migration from flat JSON files per user to PostgreSQL tables with proper constraints and indexes.
2. **UI & UX**: Modern desktop & mobile web experience with React, Tailwind CSS, and shadcn/ui.
3. **Access Control**: Provisioned multi-user architecture managed by a single operator.
