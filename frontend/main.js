import { createViewer } from "./viewer/viewer.js";
import { getAnalyzeUrl, DEFAULT_VIEW_SETTINGS } from "./config.js";
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

const viewer = createViewer(dom.viewerContainer);
viewer.setViewSettings(DEFAULT_VIEW_SETTINGS);

resetState();
selectionStore.clear();

const issueButtons = [];

const componentsController = createComponentsController({ state, viewer, selectionStore });
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
const viewSettingsController = createViewSettingsController({ viewer, dom, state });
const layoutController = createLayoutController({ dom, state });
const statusController = createStatusController({ dom, state, issuesController });

componentsController.setOnChange(() => refreshUI(state, selectionStore, dom, issuesController, componentsController, statusController, issueButtons));
issuesController.setOnChange(() => refreshUI(state, selectionStore, dom, issuesController, componentsController, statusController, issueButtons));
selectionStore.subscribe(() => refreshUI(state, selectionStore, dom, issuesController, componentsController, statusController, issueButtons));

refreshUI(state, selectionStore, dom, issuesController, componentsController, statusController, issueButtons);
viewSettingsController.loadViewSettings();
statusController.setStatus("");
renderIssueList(state, dom, issueButtons, issuesController.selectIssue, issuesController.toggleGroup, issuesController.previewIssue, issuesController.restoreSelectionHighlight);

setupEventHandlers(state, viewer, selectionStore, dom, issueButtons, componentsController, issuesController, viewSettingsController, layoutController, statusController);
