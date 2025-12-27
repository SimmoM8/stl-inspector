/**
 * Main entry point for the STL Inspector frontend application.
 *
 * This file initializes the 3D viewer, sets up application state, creates controllers
 * for managing different aspects of the UI (issues, components, view settings, layout, status),
 * and wires up event handlers and UI refresh logic.
 *
 * The app allows users to upload STL files, analyze them for mesh issues, and interactively
 * inspect problems in a 3D viewer with various rendering options.
 *
 * Key components:
 * - Viewer: 3D rendering of STL meshes using Three.js
 * - Controllers: Modular handlers for issues, components, view settings, layout, and status
 * - State: Centralized application state management
 * - Event Handlers: DOM event listeners for user interactions
 * - UI Refresh: Functions to update the UI based on state changes
 */

import { createViewer } from "./viewer/viewer.js";
import { getAnalyzeUrl } from "./utils/config.js";
import { DEFAULT_VIEW_SETTINGS } from "./constants/constants.js";
import { state, resetState } from "./state.js";
import { selectionStore } from "./selection/store.js";
import { dom } from "./ui/dom.js";
import {
    renderDetails,
    updateToolbarVisibility,
    updateActiveButtons,
    renderIssuesGrouped,
} from "./ui/render.js";
import { createComponentsController } from "./app/componentsController.js";
import { createIssuesController } from "./app/issuesController.js";
import { createViewSettingsController } from "./app/viewSettingsController.js";
import { createLayoutController } from "./app/layoutController.js";
import { createStatusController } from "./app/statusController.js";
import { renderIssueList, refreshUI } from "./uiRefresh.js";
import { setupEventHandlers } from "./eventHandlers.js";

// Initialize the 3D viewer with the container element and apply default view settings
const viewer = createViewer(dom.viewerContainer);
viewer.setViewSettings(DEFAULT_VIEW_SETTINGS);

// Reset application state to initial values and clear any previous selections
resetState();
selectionStore.clear();

// Array to hold references to dynamically created issue buttons for UI management
const issueButtons = [];

// Initialize controllers for different application features
// ComponentsController: Handles mesh component selection, ghosting, and visualization
const componentsController = createComponentsController({ state, viewer, selectionStore });

// IssuesController: Manages issue selection, highlighting, navigation, and filtering
const issuesController = createIssuesController({
    state,
    viewer,
    selectionStore,
    dom,
    issueButtons,
    renderDetails,
    updateToolbarVisibility,
    updateActiveButtons,
    renderIssuesGrouped,
});

// ViewSettingsController: Persists and syncs viewer settings with localStorage and UI controls
const viewSettingsController = createViewSettingsController({ viewer, dom, state });

// LayoutController: Manages panel switching and mobile-responsive drawer behavior
const layoutController = createLayoutController({ dom, state });

// StatusController: Handles status messages and mini-status updates
const statusController = createStatusController({ dom, state, issuesController });

// Wire up change listeners to refresh the UI whenever state or selections change
componentsController.setOnChange(() => refreshUI(state, selectionStore, dom, issuesController, componentsController, statusController, issueButtons));
issuesController.setOnChange(() => refreshUI(state, selectionStore, dom, issuesController, componentsController, statusController, issueButtons));
selectionStore.subscribe(() => refreshUI(state, selectionStore, dom, issuesController, componentsController, statusController, issueButtons));

// Perform initial UI setup and rendering
refreshUI(state, selectionStore, dom, issuesController, componentsController, statusController, issueButtons);
viewSettingsController.loadViewSettings();
statusController.setStatus("");
renderIssueList(state, dom, issueButtons, issuesController.selectIssue, issuesController.toggleGroup, issuesController.previewIssue, issuesController.restoreSelectionHighlight);

// Set up all DOM event listeners for user interactions
setupEventHandlers(state, viewer, selectionStore, dom, issueButtons, componentsController, issuesController, viewSettingsController, layoutController, statusController);
