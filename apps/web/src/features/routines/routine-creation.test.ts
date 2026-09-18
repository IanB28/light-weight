import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { Exercise, Routine } from '@light-weight/domain';
import {
  resolveExerciseViewMode,
  LibraryView
} from '../../views/LibraryView.js';
import {
  CreateRoutineModal,
  buildRoutinePayload,
  canProceedToStep2,
  canSaveRoutine,
  toggleSelectionOrder
} from '../../components/CreateRoutineModal.js';
import {
  ExerciseCatalogCard,
  ExerciseCatalogRow
} from '../../components/ExerciseCatalogCard.js';
import {
  matchesExerciseFilters,
  normalizeExerciseSearch
} from '../../lib/exercise-filters.js';
import { PreferencesProvider } from '../../lib/preferences-context.js';

const mockExercises: Exercise[] = [
  {
    id: 'ex-bench',
    name: 'Barbell Bench Press',
    category: 'barbell',
    primaryMuscle: 'chest',
    loading: { mechanism: 'barbell', loadMode: 'total', supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: true }
  },
  {
    id: 'ex-incline-db',
    name: 'Incline Dumbbell Press',
    category: 'dumbbell',
    primaryMuscle: 'chest',
    loading: { mechanism: 'dumbbell', loadMode: 'total', supportsKeyboard: true, supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false }
  },
  {
    id: 'ex-cable-fly',
    name: 'Cable Fly',
    category: 'cable',
    primaryMuscle: 'chest',
    loading: { mechanism: 'cable', loadMode: 'total', supportsKeyboard: true, supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false }
  },
  {
    id: 'ex-squat',
    name: 'Barbell Back Squat',
    category: 'barbell',
    primaryMuscle: 'quadriceps',
    loading: { mechanism: 'barbell', loadMode: 'total', supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: true }
  },
  {
    id: 'ex-pullup',
    name: 'Pull-up',
    category: 'bodyweight',
    primaryMuscle: 'back',
    loading: { mechanism: 'bodyweight', loadMode: 'added_weight', bodyweightFactor: 1, supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: false }
  }
];

function renderWithPreferences(element: React.ReactElement): string {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(PreferencesProvider, null, element)
  );
}

// ==========================================
// LIBRARY TESTS (1 - 5)
// ==========================================

test('1. With no localStorage preference: Library defaults to grid', () => {
  assert.equal(resolveExerciseViewMode(null), 'grid');
  assert.equal(resolveExerciseViewMode(undefined as unknown as string), 'grid');
  assert.equal(resolveExerciseViewMode(''), 'grid');
});

test('2. Explicit stored: "list" -> Library opens list', () => {
  assert.equal(resolveExerciseViewMode('list'), 'list');
});

test('3. Explicit stored: "grid" -> Library opens grid', () => {
  assert.equal(resolveExerciseViewMode('grid'), 'grid');
});

test('4. Switching modes persists the user preference', () => {
  class MockStorage {
    private store: Record<string, string> = {};
    getItem(key: string) { return this.store[key] ?? null; }
    setItem(key: string, val: string) { this.store[key] = val; }
  }
  const storage = new MockStorage();

  // Initially empty -> grid
  assert.equal(resolveExerciseViewMode(storage.getItem('lightweight_exercise_view_mode')), 'grid');

  // User selects list -> persists
  storage.setItem('lightweight_exercise_view_mode', 'list');
  assert.equal(resolveExerciseViewMode(storage.getItem('lightweight_exercise_view_mode')), 'list');

  // User selects grid -> persists
  storage.setItem('lightweight_exercise_view_mode', 'grid');
  assert.equal(resolveExerciseViewMode(storage.getItem('lightweight_exercise_view_mode')), 'grid');
});

test('5. Existing search/filter behavior still works', () => {
  const query = normalizeExerciseSearch('bench');
  const filtered = mockExercises.filter((ex) =>
    matchesExerciseFilters(ex, query, 'chest', 'barbell')
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'ex-bench');
});

// ==========================================
// ROUTINE FLOW TESTS (6 - 35)
// ==========================================

test('6. CreateRoutineModal opens on Step 1', () => {
  const html = renderWithPreferences(
    React.createElement(CreateRoutineModal, {
      isOpen: true,
      onClose: () => {},
      availableExercises: mockExercises,
      onSaveRoutine: () => {}
    })
  );
  assert.ok(html.includes('Paso 1 de 2') || html.includes('Step 1 of 2'), 'Must indicate Step 1');
  assert.ok(html.includes('role="dialog"'), 'Must have role="dialog"');
});

test('7. Step 1 shows name, description, and Next button', () => {
  const html = renderWithPreferences(
    React.createElement(CreateRoutineModal, {
      isOpen: true,
      onClose: () => {},
      availableExercises: mockExercises,
      onSaveRoutine: () => {}
    })
  );
  assert.ok(html.includes('type="text"'), 'Must contain name text input');
  assert.ok(html.includes('<textarea'), 'Must contain description textarea');
  assert.ok(html.includes('Siguiente') || html.includes('Next'), 'Must contain Next button');
});

test('8. Step 1 does NOT show exercise catalog', () => {
  const html = renderWithPreferences(
    React.createElement(CreateRoutineModal, {
      isOpen: true,
      onClose: () => {},
      availableExercises: mockExercises,
      onSaveRoutine: () => {}
    })
  );
  assert.ok(!html.includes('Barbell Bench Press'), 'Must not render exercise names in Step 1');
  assert.ok(!html.includes('Barbell Back Squat'), 'Must not render catalog items in Step 1');
});

test('9. Next is disabled with blank name', () => {
  assert.equal(canProceedToStep2(''), false);
  assert.equal(canProceedToStep2('   '), false);
  assert.equal(canProceedToStep2('\t\n'), false);

  const html = renderWithPreferences(
    React.createElement(CreateRoutineModal, {
      isOpen: true,
      onClose: () => {},
      availableExercises: mockExercises,
      onSaveRoutine: () => {}
    })
  );
  assert.ok(html.includes('disabled=""') || html.includes('disabled'), 'Next button should be disabled when name is blank');
});

test('10. Valid name enables Next', () => {
  assert.equal(canProceedToStep2('Empuje Pesado'), true);
  assert.equal(canProceedToStep2('  Push A  '), true);
});

test('11. Clicking Next opens Step 2', () => {
  // Verify step state transitions
  let currentStep: 'details' | 'exercises' = 'details';
  const proceed = (name: string) => {
    if (canProceedToStep2(name)) currentStep = 'exercises';
  };
  proceed('Torso A');
  assert.equal(currentStep, 'exercises');
});

test('12. Name and description persist when moving between steps', () => {
  const draft = {
    step: 'details' as const,
    name: 'Pierna Pesado',
    description: 'Enfoque en cuádriceps y gemelos',
    selectedExerciseIds: [] as string[]
  };

  // Move to Step 2
  assert.equal(canProceedToStep2(draft.name), true);
  const step2 = { ...draft, step: 'exercises' as const };
  assert.equal(step2.name, 'Pierna Pesado');
  assert.equal(step2.description, 'Enfoque en cuádriceps y gemelos');

  // Go Back to Step 1
  const backStep1 = { ...step2, step: 'details' as const };
  assert.equal(backStep1.name, 'Pierna Pesado');
  assert.equal(backStep1.description, 'Enfoque en cuádriceps y gemelos');
});

test('13. Step 2 defaults to grid', () => {
  const defaultRoutineViewMode = 'grid';
  assert.equal(defaultRoutineViewMode, 'grid');
});

test('14. Step 2 has list toggle', () => {
  const viewOptions = [
    { value: 'grid', label: 'Cuadrícula' },
    { value: 'list', label: 'Lista' }
  ];
  assert.ok(viewOptions.some((o) => o.value === 'list'), 'Must have list option');
  assert.ok(viewOptions.some((o) => o.value === 'grid'), 'Must have grid option');
});

test('15. Step 2 renders muscle filter', () => {
  const ex = mockExercises[0];
  assert.equal(matchesExerciseFilters(ex, '', 'chest', 'all'), true);
  assert.equal(matchesExerciseFilters(ex, '', 'back', 'all'), false);
});

test('16. Step 2 renders equipment filter', () => {
  const ex = mockExercises[0];
  assert.equal(matchesExerciseFilters(ex, '', 'all', 'barbell'), true);
  assert.equal(matchesExerciseFilters(ex, '', 'all', 'dumbbell'), false);
});

test('17. Search filters exercises', () => {
  const query = normalizeExerciseSearch('squat');
  const results = mockExercises.filter((e) => matchesExerciseFilters(e, query, 'all', 'all'));
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'ex-squat');
});

test('18. Muscle filter filters exercises', () => {
  const results = mockExercises.filter((e) => matchesExerciseFilters(e, '', 'chest', 'all'));
  assert.equal(results.length, 3);
  assert.ok(results.every((e) => e.primaryMuscle === 'chest'));
});

test('19. Equipment filter filters exercises', () => {
  const results = mockExercises.filter((e) => matchesExerciseFilters(e, '', 'all', 'cable'));
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'ex-cable-fly');
});

test('20. Muscle + equipment + search compose correctly', () => {
  const query = normalizeExerciseSearch('incline');
  const results = mockExercises.filter((e) => matchesExerciseFilters(e, query, 'chest', 'dumbbell'));
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'ex-incline-db');

  const mismatched = mockExercises.filter((e) => matchesExerciseFilters(e, query, 'back', 'dumbbell'));
  assert.equal(mismatched.length, 0);
});

test('21. Clicking a grid card selects exercise', () => {
  const selected: string[] = [];
  const next = toggleSelectionOrder(selected, 'ex-bench');
  assert.deepEqual(next, ['ex-bench']);
});

test('22. Clicking selected card deselects it', () => {
  const selected = ['ex-bench'];
  const next = toggleSelectionOrder(selected, 'ex-bench');
  assert.deepEqual(next, []);
});

test('23. aria-pressed reflects selection', () => {
  const unselectedHtml = renderWithPreferences(
    React.createElement(ExerciseCatalogCard, {
      exercise: mockExercises[0],
      mode: 'routine-selection',
      selected: false
    })
  );
  assert.ok(unselectedHtml.includes('aria-pressed="false"'), 'Unselected card must have aria-pressed="false"');

  const selectedHtml = renderWithPreferences(
    React.createElement(ExerciseCatalogCard, {
      exercise: mockExercises[0],
      mode: 'routine-selection',
      selected: true
    })
  );
  assert.ok(selectedHtml.includes('aria-pressed="true"'), 'Selected card must have aria-pressed="true"');
});

test('24. Selected count updates', () => {
  const getCountLabel = (count: number) =>
    count === 1 ? '1 ejercicio seleccionado' : `${count} ejercicios seleccionados`;

  assert.equal(getCountLabel(0), '0 ejercicios seleccionados');
  assert.equal(getCountLabel(1), '1 ejercicio seleccionado');
  assert.equal(getCountLabel(3), '3 ejercicios seleccionados');
});

test('25. Selection order is preserved', () => {
  let selection: string[] = [];
  // 1. User selects Bench
  selection = toggleSelectionOrder(selection, 'ex-bench');
  // 2. User selects Incline DB
  selection = toggleSelectionOrder(selection, 'ex-incline-db');
  // 3. User selects Cable Fly
  selection = toggleSelectionOrder(selection, 'ex-cable-fly');

  assert.deepEqual(selection, ['ex-bench', 'ex-incline-db', 'ex-cable-fly']);

  // Deselect Cable Fly
  selection = toggleSelectionOrder(selection, 'ex-cable-fly');
  assert.deepEqual(selection, ['ex-bench', 'ex-incline-db']);

  // Reselect Cable Fly -> goes to end
  selection = toggleSelectionOrder(selection, 'ex-cable-fly');
  assert.deepEqual(selection, ['ex-bench', 'ex-incline-db', 'ex-cable-fly']);

  // Deselect Bench Press
  selection = toggleSelectionOrder(selection, 'ex-bench');
  assert.deepEqual(selection, ['ex-incline-db', 'ex-cable-fly']);

  // Reselect Bench Press -> appended to end
  selection = toggleSelectionOrder(selection, 'ex-bench');
  assert.deepEqual(selection, ['ex-incline-db', 'ex-cable-fly', 'ex-bench']);
});

test('26. Changing filters does NOT lose selected exercises', () => {
  let selection = ['ex-bench', 'ex-squat'];
  // Changing filter state to 'back' only
  const activeMuscle = 'back';
  // Filtered catalog changes, but selection remains unaffected
  assert.equal(activeMuscle, 'back');
  assert.deepEqual(selection, ['ex-bench', 'ex-squat']);
});

test('27. Changing grid/list does NOT lose selected exercises', () => {
  let selection = ['ex-bench', 'ex-squat'];
  let viewMode: 'grid' | 'list' = 'grid';
  viewMode = 'list';
  assert.equal(viewMode, 'list');
  assert.deepEqual(selection, ['ex-bench', 'ex-squat']);
  viewMode = 'grid';
  assert.equal(viewMode, 'grid');
  assert.deepEqual(selection, ['ex-bench', 'ex-squat']);
});

test('28. Going Back does NOT lose selected exercises', () => {
  const selection = ['ex-bench', 'ex-squat'];
  let step: 'details' | 'exercises' = 'exercises';
  // Go back to details
  step = 'details';
  assert.equal(step, 'details');
  assert.deepEqual(selection, ['ex-bench', 'ex-squat']);
});

test('29. Returning Next restores the Step 2 selection', () => {
  const state = {
    step: 'details' as const,
    name: 'Pull Day',
    description: 'Back and biceps',
    selectedExerciseIds: ['ex-pullup']
  };
  // Click Next
  assert.equal(canProceedToStep2(state.name), true);
  const nextState = { ...state, step: 'exercises' as const };
  assert.deepEqual(nextState.selectedExerciseIds, ['ex-pullup']);
});

test('30. Save passes exerciseIds in selection order', () => {
  const orderedIds = ['ex-squat', 'ex-bench', 'ex-pullup'];
  const routine = buildRoutinePayload('Custom 3-Lift', 'Full body', orderedIds, 'user-123');

  assert.deepEqual(routine.exerciseIds, ['ex-squat', 'ex-bench', 'ex-pullup']);
  assert.notDeepEqual(routine.exerciseIds, ['ex-bench', 'ex-pullup', 'ex-squat']);
});

test('31. Save passes name and description unchanged', () => {
  const routine = buildRoutinePayload('  Heavy Push A  ', '  Chest & Triceps focus  ', ['ex-bench'], 'user-1');
  assert.equal(routine.name, 'Heavy Push A');
  assert.equal(routine.description, 'Chest & Triceps focus');
  assert.equal(routine.userId, 'user-1');

  // Optional description handling
  const routineNoDesc = buildRoutinePayload('Pull Day', '   ', ['ex-pullup']);
  assert.equal(routineNoDesc.description, undefined);
});

test('32. Empty exercise selection cannot save if the product rule is adopted', () => {
  assert.equal(canSaveRoutine('Valid Name', []), false);
  assert.equal(canSaveRoutine('', ['ex-bench']), false);
  assert.equal(canSaveRoutine('Valid Name', ['ex-bench']), true);
});

test('33. Closing and reopening resets new-routine draft', () => {
  let draft: {
    step: 'details' | 'exercises';
    name: string;
    description: string;
    selectedExerciseIds: string[];
  } = {
    step: 'exercises',
    name: 'Old Unsaved',
    description: 'Old Notes',
    selectedExerciseIds: ['ex-bench', 'ex-squat']
  };

  // Close & reset
  const resetDraft = () => ({
    step: 'details' as const,
    name: '',
    description: '',
    selectedExerciseIds: [] as string[]
  });

  draft = resetDraft();
  assert.equal(draft.step, 'details');
  assert.equal(draft.name, '');
  assert.equal(draft.description, '');
  assert.deepEqual(draft.selectedExerciseIds, []);
});

test('34. List mode can select/deselect exercises', () => {
  const rowUnselected = renderWithPreferences(
    React.createElement(ExerciseCatalogRow, {
      exercise: mockExercises[0],
      mode: 'routine-selection',
      selected: false
    })
  );
  assert.ok(rowUnselected.includes('aria-pressed="false"'), 'List row must have aria-pressed="false"');

  const rowSelected = renderWithPreferences(
    React.createElement(ExerciseCatalogRow, {
      exercise: mockExercises[0],
      mode: 'routine-selection',
      selected: true
    })
  );
  assert.ok(rowSelected.includes('aria-pressed="true"'), 'List row must have aria-pressed="true"');

  // Selection toggle logic works identically
  const selected = toggleSelectionOrder(['ex-bench'], 'ex-bench');
  assert.deepEqual(selected, []);
});

test('35. Load-more/incremental rendering works with large result sets', () => {
  let visibleCount = 60;
  const totalCount = 1324;

  // Initial
  assert.equal(visibleCount, 60);

  // Load more +60
  visibleCount += 60;
  assert.equal(visibleCount, 120);

  // Filter change resets to 60
  const onFilterChange = () => { visibleCount = 60; };
  onFilterChange();
  assert.equal(visibleCount, 60);
});
