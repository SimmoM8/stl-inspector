import { renderIssueList } from '../uiRefresh.js';

// Mock the render functions
jest.mock('../ui/render.js', () => ({
    renderIssuesGrouped: jest.fn(),
}));

import { renderIssuesGrouped } from '../ui/render.js';

/**
 * Unit tests for uiRefresh.js
 */
describe('renderIssueList', () => {
    let mockDom;
    let mockIssueButtons;
    let mockState;
    let mockSelectIssue;
    let mockToggleGroup;
    let mockPreviewIssue;
    let mockRestoreSelectionHighlight;

    beforeEach(() => {
        mockDom = {};
        mockIssueButtons = [];
        mockState = {
            issues: [
                { type: 'degenerate_faces', severity: 'warning' },
                { type: 'boundary_edges', severity: 'info' }
            ]
        };
        mockSelectIssue = jest.fn();
        mockToggleGroup = jest.fn();
        mockPreviewIssue = jest.fn();
        mockRestoreSelectionHighlight = jest.fn();

        jest.clearAllMocks();
    });

    test('should call renderIssuesGrouped with correct parameters', () => {
        renderIssueList(
            mockState,
            mockDom,
            mockIssueButtons,
            mockSelectIssue,
            mockToggleGroup,
            mockPreviewIssue,
            mockRestoreSelectionHighlight
        );

        expect(renderIssuesGrouped).toHaveBeenCalledWith(
            mockState,
            mockDom,
            mockIssueButtons,
            mockSelectIssue,
            mockToggleGroup,
            mockPreviewIssue,
            mockRestoreSelectionHighlight
        );
    });

    test('should handle empty issues array', () => {
        mockState.issues = [];

        renderIssueList(
            mockState,
            mockDom,
            mockIssueButtons,
            mockSelectIssue,
            mockToggleGroup,
            mockPreviewIssue,
            mockRestoreSelectionHighlight
        );

        expect(renderIssuesGrouped).toHaveBeenCalledWith(
            mockState,
            mockDom,
            mockIssueButtons,
            mockSelectIssue,
            mockToggleGroup,
            mockPreviewIssue,
            mockRestoreSelectionHighlight
        );
    });
});