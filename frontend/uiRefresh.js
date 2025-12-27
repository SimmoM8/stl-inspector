// uiRefresh.js - Functions for refreshing UI components and rendering issue lists

import {
    renderIssuesGrouped,
    renderComponentsList,
    updateActiveButtons,
    updateSummary,
} from "./ui/render.js";

/**
 * Renders issue buttons grouped by severity with hover/select handlers.
 * @param {Object} state - Application state
 * @param {Object} dom - DOM elements
 * @param {Array} issueButtons - Array of issue buttons
 * @param {Function} selectIssue - Function to select an issue
 * @param {Function} toggleGroup - Function to toggle group visibility
 * @param {Function} previewIssue - Function to preview an issue
 * @param {Function} restoreSelectionHighlight - Function to restore selection highlight
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
 * Re-renders UI pieces to reflect selection, filters, and summary.
 * @param {Object} state - Application state
 * @param {Object} selectionStore - Selection store instance
 * @param {Object} dom - DOM elements
 * @param {Object} issuesController - Issues controller instance
 * @param {Object} componentsController - Components controller instance
 * @param {Object} statusController - Status controller instance
 * @param {Array} issueButtons - Array of issue buttons
 */
export function refreshUI(state, selectionStore, dom, issuesController, componentsController, statusController, issueButtons) {
    const selection = selectionStore.getSelection();
    issuesController.renderSelection();
    renderComponentsList(state, dom, selection, componentsController.applyComponentSelection, componentsController.setComponentGhosted);
    updateSummary(dom, state.summary);
    updateActiveButtons(selection, issueButtons);
    dom.issuesFilterButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.filter === state.issueFilter);
    });
    if (dom.emptyState) dom.emptyState.classList.toggle("hidden", !!state.summary);
    statusController.updateMiniStatus();
}