// Handle layout toggles such as panels and mobile drawer state.
// Create layout controller bound to DOM; exposes mobile helpers and panel switching.
function createLayoutController({ dom, state }) {
    const mobileQuery = window.matchMedia("(max-width: 900px)");

    // True when viewport is under mobile breakpoint.
    function isMobile() {
        return mobileQuery.matches;
    }

    // Disable drawer toggle on desktop to prevent accidental clicks.
    function syncDrawerToggleState() {
        if (dom.drawerToggleBtn) {
            dom.drawerToggleBtn.disabled = !isMobile();
        }
    }

    // Open/close the context drawer; auto-close when on desktop.
    function setDrawerOpen(open) {
        if (!dom.contextPanel || !dom.drawerBackdrop) return;
        if (!isMobile()) {
            dom.contextPanel.classList.remove("is-open");
            dom.drawerBackdrop.classList.remove("is-visible");
            document.body.classList.remove("no-scroll");
            syncDrawerToggleState();
            return;
        }
        dom.contextPanel.classList.toggle("is-open", open);
        dom.drawerBackdrop.classList.toggle("is-visible", open);
        document.body.classList.toggle("no-scroll", open);
        syncDrawerToggleState();
    }

    // Switch active panel by name and update rail button states.
    function setActivePanel(panelName) {
        state.activePanel = panelName;
        dom.panels.forEach((p) => {
            p.classList.toggle("hidden", p.id !== `panel-${panelName}`);
        });
        dom.railButtons.forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.panel === panelName);
        });
    }

    return {
        isMobile,
        mobileQuery,
        setActivePanel,
        setDrawerOpen,
        syncDrawerToggleState,
    };
}

export { createLayoutController };
