// Handle layout toggles such as panels and mobile drawer state.
function createLayoutController({ dom, state }) {
    const mobileQuery = window.matchMedia("(max-width: 900px)");

    function isMobile() {
        return mobileQuery.matches;
    }

    function syncDrawerToggleState() {
        if (dom.drawerToggleBtn) {
            dom.drawerToggleBtn.disabled = !isMobile();
        }
    }

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
