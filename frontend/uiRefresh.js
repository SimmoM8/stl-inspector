// uiRefresh.js - Functions for refreshing UI components and rendering issue lists

import {
    renderIssuesGrouped,
    renderComponentsList,
    updateActiveButtons,
    updateSummary,
} from "./ui/render.js";

/**
 * Renders the list of issues grouped by severity in the UI.
 * This function updates the issues panel with buttons for each issue,
 * allowing users to select and interact with detected mesh problems.
 * @param {Object} state - The application state containing issues and filters
 * @param {Object} dom - DOM element references
 * @param {Array} issueButtons - Array to store references to created issue buttons
 * @param {Function} selectIssue - Callback to select an issue
 * @param {Function} toggleGroup - Callback to toggle group visibility
 * @param {Function} previewIssue - Callback to preview an issue on hover
 * @param {Function} restoreSelectionHighlight - Callback to restore selection highlight
 */
export function renderIssueList(state, dom, issueButtons, selectIssue, toggleGroup, previewIssue, restoreSelectionHighlight) {
    renderIssuesGrouped(
        state,
        dom,
        issueButtons,
        selectIssue,
        toggleGroup,
        previewIssue,
        restoreSelectionHighlight
    );
}

/**
 * Refreshes the entire UI to reflect current state, selection, and filters.
 * This is called whenever the application state changes to ensure the UI
 * stays synchronized with the underlying data.
 * @param {Object} state - The application state
 * @param {Object} selectionStore - The selection store instance
 * @param {Object} dom - DOM element references
 * @param {Object} issuesController - Controller for issue-related operations
 * @param {Object} componentsController - Controller for component-related operations
 * @param {Object} statusController - Controller for status messages
 * @param {Array} issueButtons - Array of issue buttons
 */
export function refreshUI(state, selectionStore, dom, issuesController, componentsController, statusController, issueButtons) {
    const selection = selectionStore.getSelection();
    issuesController.renderSelection();
    renderComponentsList(state, dom, selection, componentsController.applyComponentSelection);
    updateSummary(dom, state.summary);
    updateActiveButtons(selection, issueButtons);
    dom.issuesFilterButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.filter === state.issueFilter);
    });
    if (dom.emptyState) dom.emptyState.classList.toggle("hidden", !!state.summary);
    statusController.updateMiniStatus();
}