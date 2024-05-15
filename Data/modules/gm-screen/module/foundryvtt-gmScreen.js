var MySettings$1;
(function (MySettings) {
    MySettings["columns"] = "columns";
    MySettings["displayDrawer"] = "display-as-drawer";
    MySettings["drawerHeight"] = "drawer-height";
    MySettings["drawerOpacity"] = "drawer-opacity";
    MySettings["drawerWidth"] = "drawer-width";
    MySettings["gmScreenConfig"] = "gm-screen-config";
    MySettings["migrated"] = "migrated";
    MySettings["condensedButton"] = "condensedButton";
    MySettings["reset"] = "reset";
    MySettings["rightMargin"] = "right-margin";
    MySettings["rows"] = "rows";
})(MySettings$1 || (MySettings$1 = {}));
var MyHooks$1;
(function (MyHooks) {
    MyHooks["openClose"] = "gmScreenOpenClose";
    MyHooks["ready"] = "gmScreenReady";
})(MyHooks$1 || (MyHooks$1 = {}));
var MyFlags;
(function (MyFlags) {
    MyFlags["gmScreenSheetClass"] = "gmScreenSheetClass";
})(MyFlags || (MyFlags = {}));

const MODULE_ID = 'gm-screen';
const MODULE_ABBREV = 'GMSCR';
var MySettings;
(function (MySettings) {
    MySettings["columns"] = "columns";
    MySettings["displayDrawer"] = "display-as-drawer";
    MySettings["drawerHeight"] = "drawer-height";
    MySettings["drawerOpacity"] = "drawer-opacity";
    MySettings["drawerWidth"] = "drawer-width";
    MySettings["gmScreenConfig"] = "gm-screen-config";
    MySettings["migrated"] = "migrated";
    MySettings["condensedButton"] = "condensedButton";
    MySettings["reset"] = "reset";
    MySettings["rightMargin"] = "right-margin";
    MySettings["rows"] = "rows";
})(MySettings || (MySettings = {}));
var MyHooks;
(function (MyHooks) {
    MyHooks["openClose"] = "gmScreenOpenClose";
    MyHooks["ready"] = "gmScreenReady";
})(MyHooks || (MyHooks = {}));

function log(force, ...args) {
    const shouldLog = force || game.modules.get('_dev-mode')?.api?.getPackageDebugValue(MODULE_ID);
    if (shouldLog) {
        console.log(MODULE_ID, '|', ...args);
    }
}
const debouncedReload = foundry.utils.debounce(() => window.location.reload(), 100);
/**
 * Creates a custom CSS property with the name provide on the element.style of all elements which match
 * the selector provided containing the computed value of the property specified.
 *
 * @param {JQuery<HTMLElement>} html - Some HTML element to search within for the selector
 * @param {string} selector - A CSS style selector which will be used to locate the target elements for this function.
 * @param {keyof CSSStyleDeclaration} property - The name of a CSS property to obtain the computed value of
 * @param {string} name - The name of the CSS variable (custom property) that will be created/updated.
 * @memberof GmScreenApplication
 */
function updateCSSPropertyVariable(html, selector, property, name) {
    html.find(selector).each((i, gridCell) => {
        const value = window.getComputedStyle(gridCell)[property];
        gridCell.style.setProperty(name, String(value));
    });
}
/**
 * Helper for getting a user's cell config inputs via a dialog
 */
function getUserCellConfigurationInput(cellToConfigure, gridDetails) {
    return new Promise((resolve, reject) => {
        new Dialog({
            title: game.i18n.localize(`${MODULE_ABBREV}.cellConfigDialog.CellConfig`),
            content: `
  <form class="flexcol">
    <div class="form-group">
      <label for="spanRows">${game.i18n.localize(`${MODULE_ABBREV}.cellConfigDialog.RowSpan`)}</label>
      <input type="number" step="1" name="spanRows" min="1" max="${gridDetails.rows + 1 - cellToConfigure.y}" value="${cellToConfigure.spanRows || 1}">
    </div>
    <div class="form-group">
      <label for="spanCols">${game.i18n.localize(`${MODULE_ABBREV}.cellConfigDialog.ColSpan`)}</label>
      <input type="number" step="1" name="spanCols" min="1" max="${gridDetails.columns + 1 - cellToConfigure.x}" value="${cellToConfigure.spanCols || 1}">
    </div>
  </form>
`,
            buttons: {
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize('Cancel'),
                },
                reset: {
                    icon: '<i class="fas fa-undo"></i>',
                    label: game.i18n.localize('Default'),
                    callback: () => {
                        const formValues = {
                            newSpanRows: 1,
                            newSpanCols: 1,
                        };
                        log(false, 'dialog formValues', formValues);
                        resolve(formValues);
                    },
                },
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize('Submit'),
                    //@ts-expect-error idk
                    callback: (html) => {
                        const formValues = {
                            newSpanRows: Number(html.find('[name="spanRows"]').val()),
                            newSpanCols: Number(html.find('[name="spanCols"]').val()),
                        };
                        log(false, 'dialog formValues', formValues);
                        resolve(formValues);
                    },
                },
            },
            default: 'yes',
            close: () => {
                reject();
            },
        }).render(true);
    });
}

class GmScreenSettingsConfig extends FormApplication {
    constructor() {
        super(...arguments);
        this.handleNewRowClick = async (currentTarget) => {
            const tbodyElement = $(this.element).find('tbody');
            const newGridRowTemplateData = {
                gridId: randomID(),
                grid: {
                    name: '',
                    columnOverride: '',
                    rowOverride: '',
                },
                defaultColumns: this.data.defaultColumns,
                defaultRows: this.data.defaultRows,
            };
            const newRow = $(await renderTemplate(GmScreen.TEMPLATES.grids.tableRow, newGridRowTemplateData));
            // render a new row at the end of tbody
            tbodyElement.append(newRow);
            this.setPosition({}); // recalc height
        };
        this.handleDeleteRowClick = (currentTarget) => {
            log(false, 'delete row clicked', {
                currentTarget,
            });
            currentTarget.closest('tr').remove();
            this.setPosition({}); // recalc height
        };
    }
    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            classes: ['gm-screen-config'],
            closeOnSubmit: false,
            height: 'auto',
            submitOnChange: false,
            submitOnClose: false,
            id: 'gm-screen-tabs-config',
            template: GmScreen.TEMPLATES.settings,
            title: game.i18n.localize(`${MODULE_ABBREV}.gridConfig.GridConfig`),
            width: 600,
        };
    }
    get data() {
        return GmScreen.dataManager.gmScreenSettingsConfigData;
    }
    getData() {
        return {
            ...GmScreen.dataManager.gmScreenSettingsConfigData,
        };
    }
    // TODO: Audit this?
    _dragListeners(html) {
        let draggedRow;
        html.on('dragstart', (e) => {
            draggedRow = e.target;
        });
        html.on('dragover', (e) => {
            if (!draggedRow) {
                return;
            }
            const targetRow = $(e.target).parents('tbody tr')[0];
            if (!targetRow) {
                return;
            }
            const tableRows = Array.from($(e.target).parents('tbody').children());
            if (tableRows.indexOf(targetRow) > tableRows.indexOf(draggedRow)) {
                targetRow.after(draggedRow);
            }
            else {
                targetRow.before(draggedRow);
            }
        });
        html.on('dragend', (e) => {
            draggedRow = undefined;
        });
    }
    activateListeners(html) {
        super.activateListeners(html);
        this._dragListeners(html);
        html.on('click', 'button', (event) => {
            const action = event.currentTarget?.dataset?.action;
            switch (action) {
                case 'add-row': {
                    this.handleNewRowClick(event.currentTarget);
                    break;
                }
                case 'delete-row': {
                    this.handleDeleteRowClick(event.currentTarget);
                    break;
                }
            }
        });
    }
    async _updateObject(event, formData) {
        const dataManager = GmScreen.dataManager;
        const formDataObject = expandObject(formData);
        log(false, {
            formData,
            formDataObject,
        });
        if (Object.keys(formDataObject).length === 0) {
            ui.notifications?.error(game.i18n.localize(`${MODULE_ABBREV}.gridConfig.errors.empty`));
            throw new Error('Cannot save the grid with no tabs.');
        }
        const newGridIds = Object.keys(formDataObject.grids);
        // rebuild the grids object on every save
        const newGrids = newGridIds.reduce((acc, gridId) => {
            const grid = formDataObject.grids[gridId];
            // if this grid exists already, spread the old and modify it
            if (dataManager.grids.hasOwnProperty(gridId)) {
                acc[gridId] = {
                    ...dataManager.grids[gridId],
                    ...grid,
                };
                return acc;
            }
            // otherwise create it
            acc[gridId] = {
                ...grid,
                entries: {},
                name: grid.name ?? '',
                isShared: grid.isShared ?? false,
                id: gridId,
            };
            return acc;
        }, {});
        // handle case where active tab is deleted
        const newActiveGridId = newGridIds.includes(dataManager.activeGmGridId)
            ? dataManager.activeGmGridId
            : newGridIds[0];
        const newGmScreenConfig = {
            grids: newGrids,
            activeGridId: newActiveGridId,
        };
        log(true, 'setting settings', {
            newGmScreenConfig,
        });
        await game.settings.set(MODULE_ID, GmScreen.SETTINGS.gmScreenConfig, newGmScreenConfig);
        this.close();
    }
}

const defaultGmScreenData = {
    activeGridId: 'default',
    grids: {
        default: {
            name: 'Main',
            id: 'default',
            isShared: false,
            entries: {},
        },
    },
};
/**
 * Handles getting and preparing the GM Screen data for the logged in user.
 * Refreshed via the `refresh` method, does not automatically keep up to date with settings.
 * Also provides some helper functions for setting grid-related data.
 *
 * Responsible for keeping track of the GM Screen Settings data changes to make refreshing the grid less resource heavy.
 */
class GmScreenDataManager {
    constructor() {
        /**
         * Populate this instance with the data from settings.
         * Runs from the Settings registered `onChange`
         * Re-renders the grid if necessary
         * // should be `refreshGmScreen` from the api
         */
        this.refresh = () => {
            this._oldData = foundry.utils.deepClone(this._data);
            this._data = game.settings.get(MODULE_ID, GmScreen.SETTINGS.gmScreenConfig);
            this._gridOptions = {
                rows: game.settings.get(MODULE_ID, GmScreen.SETTINGS.rows),
                columns: game.settings.get(MODULE_ID, GmScreen.SETTINGS.columns),
            };
            log(false, 'refreshing gm screen data', {
                newData: foundry.utils.deepClone(this._data),
                data: foundry.utils.deepClone(this._oldData),
                diffGridIds: this.diffGridIds,
            });
            // do nothing if there are no grid ids that changed
            if (!this.diffGridIds) {
                return;
            }
            // 1. see if the grids I can see are the ones that changed
            // if this is true we need to rerender
            const myGridsChanged = this.diffGridIds.filter((diffGridId) => Object.keys(this.grids).includes(diffGridId));
            // 2. check if the gridIds I can currently see are the same as before the diff
            // if this is true we need to rerender
            const myVisibleGridIdsChanged = this.visibleGridIdsChanged;
            // if both are false, don't re-render
            if (!myVisibleGridIdsChanged && !myGridsChanged) {
                log(false, 'not rerendering because none of my visible grids changed');
                return;
            }
            // TODO: Re-render GM Screen Application?
            // provides diffGridIds
            GmScreen.gmScreenApp.refresh();
        };
        /**
         * Double confirms Clearing the Active Grid
         */
        this.clearActiveGrid = () => {
            log(false, 'clearActiveGrid');
            return Dialog.confirm({
                title: game.i18n.localize(`${MODULE_ABBREV}.warnings.clearConfirm.Title`),
                content: game.i18n.localize(`${MODULE_ABBREV}.warnings.clearConfirm.Content`),
                yes: async () => {
                    return this.setGridData({
                        ...this.activeGmGrid,
                        entries: {},
                    });
                },
            });
        };
        this._data = game.settings.get(MODULE_ID, GmScreen.SETTINGS.gmScreenConfig);
        this._gridOptions = {
            rows: game.settings.get(MODULE_ID, GmScreen.SETTINGS.rows),
            columns: game.settings.get(MODULE_ID, GmScreen.SETTINGS.columns),
        };
    }
    /**
     * Cached copy of the previous grid data from settings
     * used to tell the diff
     */
    // static _oldGmScreenConfig: GmScreenSettingsData;
    get gmScreenSettingsConfigData() {
        return {
            settings: this._data,
            defaultRows: this._gridOptions.rows,
            defaultColumns: this._gridOptions.columns,
        };
    }
    // static get _defaultColumns() {
    //   return game.settings.get(MODULE_ID, GmScreen.SETTINGS.columns);
    // }
    // static get _defaultRows() {
    //   return game.settings.get(MODULE_ID, GmScreen.SETTINGS.rows);
    // }
    /** Filters grids to ones the logged in user can see */
    get grids() {
        return GmScreenDataManager.getUserVisibleGridsFromSettingsData(this._data);
    }
    /** Only matters to the GM */
    get activeGmGridId() {
        return this._data?.activeGridId ?? defaultGmScreenData.activeGridId;
    }
    /**
     * Helper to return the grid currently marked active
     * Only matters for GMs
     */
    get activeGmGrid() {
        return this.grids[this.activeGmGridId];
    }
    /**
     * @returns `true` if the user has any visible grids
     */
    get hasUserViewableGrids() {
        return !!Object.keys(this.grids).length;
    }
    /**
     * @returns `true` if the user wants to use drawer mode
     */
    get drawerMode() {
        return game.settings.get(MODULE_ID, GmScreen.SETTINGS.displayDrawer);
    }
    /**
     * A helper to aggregate a few settings useful for displaying the GM Screen Application
     */
    get applicationData() {
        const { SETTINGS } = GmScreen;
        return {
            ...this._gridOptions,
            rightMargin: game.settings.get(MODULE_ID, SETTINGS.rightMargin),
            drawerWidth: game.settings.get(MODULE_ID, SETTINGS.drawerWidth),
            drawerHeight: game.settings.get(MODULE_ID, SETTINGS.drawerHeight),
            drawerOpacity: game.settings.get(MODULE_ID, SETTINGS.drawerOpacity),
            condensedButton: game.settings.get(MODULE_ID, SETTINGS.condensedButton),
            displayDrawer: game.settings.get(MODULE_ID, SETTINGS.displayDrawer),
        };
    }
    /**
     * Gets the gridIds that were most recently updated
     * @returns the grid ids that have changed recently
     */
    get diffGridIds() {
        if (!this._oldData?.grids) {
            return Object.keys(this._data.grids);
        }
        return Object.keys(foundry.utils.diffObject(this._oldData.grids, this._data.grids));
    }
    /**
     * Checks if there are any newly visible or invisible grids to this user
     * @returns true if the grids visible to this user have changed
     */
    get visibleGridIdsChanged() {
        const userVisibleGridIds = new Set(Object.keys(this.grids));
        // if there was no old data, all grids are new
        if (!this._oldData) {
            return true;
        }
        const oldUserVisibleGridIds = new Set(Object.keys(GmScreenDataManager.getUserVisibleGridsFromSettingsData(this._oldData)));
        return !userVisibleGridIds.equals(oldUserVisibleGridIds);
    }
    /**
     * Overrides the existing Grid object in settings with the provided object
     *
     * Refreshes automatically on all clients because of the `onChange` callback on the setting registration
     */
    setGridData(newGridData) {
        if (!game.user?.isGM) {
            throw new Error('You must be a GM user to edit a Grid');
        }
        const newGmScreenConfig = foundry.utils.deepClone(this._data);
        const updated = setProperty(newGmScreenConfig, `grids.${newGridData.id}`, newGridData);
        if (!updated) {
            // something failed
            throw new Error('Something went wrong trying to update the grid data.');
        }
        log(false, 'setGridData', {
            currentConfig: this._data,
            newGmScreenConfig,
            updated,
        });
        // changing this setting will auto-refresh the screen
        return game.settings.set(MODULE_ID, GmScreen.SETTINGS.gmScreenConfig, newGmScreenConfig);
    }
    /**
     * Sets the active GM Grid ID (i.e. the one we expect the GM to be looking at)
     */
    async setActiveGmGridId(newActiveGridId) {
        if (!game.user?.isGM || newActiveGridId === this.activeGmGridId || !newActiveGridId) {
            return;
        }
        log(false, 'trying to set active grid', { newActiveGridId });
        try {
            const newGmScreenConfig = foundry.utils.deepClone(this._data);
            newGmScreenConfig.activeGridId = newActiveGridId;
            await game.settings.set(MODULE_ID, GmScreen.SETTINGS.gmScreenConfig, newGmScreenConfig);
        }
        catch (error) {
            log(true, 'error setting active tab', error);
        }
    }
    /**
     * Gets the grid entries for a given grid as an array with empty cells populated
     */
    getHydratedGridEntries(grid) {
        const gridColumns = grid.columnOverride ?? this._gridOptions.columns;
        const gridRows = grid.rowOverride ?? this._gridOptions.rows;
        const emptyCellsNum = Number(gridColumns) * Number(gridRows) - GmScreenDataManager.getNumOccupiedCells(grid);
        const emptyCells = emptyCellsNum > 0 ? [...new Array(emptyCellsNum)].map(() => ({})) : [];
        return [...Object.values(grid.entries), ...emptyCells];
    }
    /**
     * Adds a new entry to the currently active grid
     */
    addEntryToActiveGrid(newEntry) {
        if (!game.user?.isGM) {
            throw new Error('You must be a GM user to edit a Grid');
        }
        const newEntries = { ...this.activeGmGrid.entries };
        newEntries[newEntry.entryId] = {
            ...newEntries[newEntry.entryId],
            ...newEntry,
        };
        const newGridData = {
            ...this.activeGmGrid,
            entries: newEntries,
        };
        log(false, 'addEntryToActiveGrid', {
            activeGmGridData: this.activeGmGrid,
            newEntries,
            newEntry,
            newGridData,
        });
        return this.setGridData(newGridData);
    }
    /**
     * Remove a given entry from the Active Grid
     * @param {string} entryId - entry to remove from the active grid's entries
     */
    removeEntryFromActiveGrid(entryId) {
        const clearedCell = foundry.utils.deepClone(this.activeGmGrid.entries[entryId]);
        const shouldKeepCellLayout = clearedCell.spanCols || clearedCell.spanRows;
        const newEntries = {
            ...this.activeGmGrid.entries,
        };
        if (shouldKeepCellLayout) {
            delete clearedCell.entityUuid;
            newEntries[entryId] = clearedCell;
        }
        else {
            delete newEntries[entryId];
        }
        const newGridData = {
            ...this.activeGmGrid,
            entries: newEntries,
        };
        // TODO: This needs to close the open entry applications(?)
        return this.setGridData(newGridData);
    }
    /**
     * Handles any cell overlap problems that new grid entry data might introduce
     */
    editCellInActiveGrid(gridEntry) {
        const newEntries = {
            ...this.activeGmGrid.entries,
            [gridEntry.entryId]: gridEntry,
        };
        // based on the X, Y, and Span values of `newCell` find all problematic entryIds
        // BRITTLE if entryId's formula changes
        const problemCoordinates = [...Array(gridEntry.spanCols).keys()]
            .map((_, index) => {
            const problemX = gridEntry.x + index;
            return [...Array(gridEntry.spanRows).keys()].map((_, index) => {
                const problemY = gridEntry.y + index;
                return `${problemX}-${problemY}`; // problem cell's id
            });
        })
            .flat();
        log(false, {
            problemCoordinates,
        });
        // get any overlapped cells and remove them
        Object.values(newEntries).forEach((entry) => {
            if (problemCoordinates.includes(entry.entryId) && entry.entryId !== gridEntry.entryId) {
                delete newEntries[entry.entryId];
            }
        });
        log(false, 'newEntries', newEntries);
        const newGridData = {
            ...this.activeGmGrid,
            entries: newEntries,
        };
        return this.setGridData(newGridData);
    }
    /***********************/
    /**  STATIC HELPERS  ***/
    /***********************/
    /**
     * Given the set of settings data, return only the grids visible to this user
     */
    static getUserVisibleGridsFromSettingsData({ grids }) {
        if (!game.user) {
            return {};
        }
        if (game.user?.isGM) {
            return grids;
        }
        return Object.fromEntries(Object.entries(grids).filter(([_gridId, gridData]) => gridData.isShared));
    }
    /** Calulates how many cells are occupied for a given grid */
    static getNumOccupiedCells(grid) {
        return Object.values(grid.entries).reduce((acc, entry) => {
            const cellsTaken = (entry.spanCols || 1) * (entry.spanRows || 1);
            return acc + cellsTaken;
        }, 0);
    }
    /**
     * Utility method to help typescript understand that these are only
     * actors, items, journals, or rolltables
     *
     * @param entityUuid - relevant entityUuid
     */
    static async getRelevantGmScreenDocument(entityUuid) {
        const relevantDocument = await fromUuid(entityUuid);
        if (!(relevantDocument instanceof Actor ||
            relevantDocument instanceof Item ||
            relevantDocument instanceof JournalEntry ||
            relevantDocument instanceof JournalEntryPage ||
            relevantDocument instanceof RollTable)) {
            return;
        }
        return relevantDocument;
    }
}

class CompactRollTableDisplay extends RollTableConfig {
    get isEditable() {
        return false;
    }
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: GmScreen.TEMPLATES.compactRollTable,
            editable: false,
            popOut: false,
        });
    }
    getData() {
        const sheetData = super.getData();
        if (sheetData instanceof Promise) {
            return sheetData;
        }
        // TODO: Rolltable.Result and Results wrong
        const enrichedResults = sheetData.results.map((result) => {
            const label = this._getLabelFromResult(result);
            return {
                ...result,
                label,
            };
        });
        return { ...sheetData, enrichedResults };
    }
    async _rollOnTable() {
        const rollTable = this.document;
        await rollTable.draw();
    }
    _getLabelFromResult(result) {
        let label;
        switch (result.type) {
            case CONST.TABLE_RESULT_TYPES.COMPENDIUM: {
                label = `@Compendium[${result.documentCollection}.${result.documentId}]{${result.text}}`;
                break;
            }
            case CONST.TABLE_RESULT_TYPES.ENTITY: {
                label = `@${result.documentCollection}[${result.documentId}]{${result.text}}`;
                break;
            }
            default:
                label = result.text;
        }
        return label;
    }
}

/**
 * Helpers to make interacting with or rendering a given GridEntry easier
 * TODO: Should this be it's own class that is created for each cell?
 */
class GmScreenCell {
    /**
     * Apply overrides to make this grid entry render inside the provided cellId
     * MUTATES SheetClass
     * BRITTLE
     */
    static applyGmScreenCellSheetOverrides(SheetClass, cellId) {
        SheetClass.options.editable = false;
        SheetClass.options.popOut = false;
        //@ts-expect-error Yeah I know this isn't the best idea
        SheetClass.cellId = cellId;
        Object.defineProperty(SheetClass, 'isEditable', { value: false });
        //@ts-expect-error Yeah I know this isn't the best idea
        SheetClass._injectHTML = function (html) {
            //@ts-expect-error I inject cellId
            $(this.cellId).find('.gm-screen-grid-cell-title').text(this.title);
            //@ts-expect-error I inject cellId
            const gridCellContent = $(this.cellId).find('.gm-screen-grid-cell-content');
            log(false, 'CompactEntitySheet overwritten _injectHTML', {
                targetElement: gridCellContent,
                gridCellContent,
                //@ts-expect-error I inject cellId
                cellId: this.cellId,
                html,
            });
            gridCellContent.append(html);
            //@ts-expect-error Yeah I know this isn't the best idea
            this._element = html;
        };
        //@ts-expect-error Yeah I know this isn't the best idea
        SheetClass._replaceHTML = function (element, html, options) {
            //@ts-expect-error I inject cellId
            $(this.cellId).find('.gm-screen-grid-cell-title').text(this.title);
            //@ts-expect-error I inject cellId
            const gridCellContent = $(this.cellId).find('.gm-screen-grid-cell-content');
            gridCellContent.html(html);
            //@ts-expect-error Yeah I know this isn't the best idea
            this._element = html;
        };
    }
    /**
     * Obtain the FormApplication class constructor which should be used to display this Document in the Gm Screen.
     * Adapted from `ClientDocumentMixin._getSheetClass`
     */
    static _getGridEntrySheetClass(document) {
        const cfg = CONFIG[document.documentName];
        // @ts-expect-error 'type' is expected to be undefined sometimes
        // this document's type (or "base")
        const type = document.type || CONST.BASE_DOCUMENT_TYPE;
        // @ts-expect-error 'sheetClasses' is expected to exist
        // this document type's sheet definitions
        const documentTypeSheets = cfg.sheetClasses[type] || {};
        const gmScreenOverride = document.getFlag(MODULE_ID, GmScreen.FLAGS.gmScreenSheetClass);
        const coreOverride = document.getFlag('core', 'sheetClass');
        // if there's a gm screen override defined, use that
        if (documentTypeSheets[gmScreenOverride])
            return documentTypeSheets[gmScreenOverride].cls;
        // if there's a core override defined, use that
        if (documentTypeSheets[coreOverride])
            return documentTypeSheets[coreOverride].cls;
        // all of the sheet class definitions for this document's type
        const possibleSheetDefinitions = Object.values(documentTypeSheets);
        if (!possibleSheetDefinitions.length)
            return null;
        // TODO: Add "GM Screen Default Sheet Class"
        const coreDefaultSheetClass = (possibleSheetDefinitions.find((s) => s.default) ?? possibleSheetDefinitions.pop())
            ?.cls;
        // I have no idea how to incorporate this into the sheet enum in a nice way
        if (document instanceof RollTable) {
            return CompactRollTableDisplay;
        }
        return coreDefaultSheetClass;
    }
    /**
     * Gets user inputs about how a cell should change (row and column span)
     * submits that as an edit
     */
    static async _onConfigureGridEntry({ x, y }, entryId) {
        try {
            let entryToConfigure = {
                x,
                y,
                entryId: `${x}-${y}`,
            };
            if (entryId) {
                entryToConfigure = GmScreen.dataManager.activeGmGrid.entries[entryId];
            }
            log(false, 'configureCell cellToConfigure', entryToConfigure);
            const { newSpanRows, newSpanCols } = await getUserCellConfigurationInput(entryToConfigure, {
                rows: GmScreen.dataManager.activeGmGrid.rowOverride ?? GmScreen.dataManager.applicationData.rows,
                columns: GmScreen.dataManager.activeGmGrid.columnOverride ?? GmScreen.dataManager.applicationData.columns,
            });
            log(false, 'new span values from dialog', {
                newSpanRows,
                newSpanCols,
            });
            const newEntry = {
                ...entryToConfigure,
                spanRows: newSpanRows,
                spanCols: newSpanCols,
            };
            return GmScreen.dataManager.editCellInActiveGrid(newEntry);
        }
        catch (e) {
            log(false, 'User exited configure cell Dialog.');
        }
    }
    /**
     * Handle "open" clicks to render the original document's sheet normally
     */
    static async _onClickOpen(entityUuid) {
        if (!entityUuid) {
            return;
        }
        try {
            const relevantDocument = await GmScreenDataManager.getRelevantGmScreenDocument(entityUuid);
            const relevantDocumentSheet = relevantDocument?.sheet;
            log(false, 'trying to edit entity', { relevantEntitySheet: relevantDocumentSheet });
            if (!relevantDocumentSheet) {
                return;
            }
            // If the sheet is already rendered:
            if (relevantDocumentSheet.rendered) {
                relevantDocumentSheet.bringToTop();
                return relevantDocumentSheet.maximize();
            }
            // Otherwise render the relevantDocumentSheet
            else
                relevantDocumentSheet.render(true);
        }
        catch (error) {
            log(true, 'error opening entity sheet', error);
        }
    }
}

var ClickAction;
(function (ClickAction) {
    ClickAction["clearGrid"] = "clearGrid";
    ClickAction["refresh"] = "refresh";
    ClickAction["clearCell"] = "clearCell";
    ClickAction["configureCell"] = "configureCell";
    ClickAction["open"] = "open";
    ClickAction["toggle-gm-screen"] = "toggle-gm-screen";
    ClickAction["setActiveGridId"] = "setActiveGridId";
    ClickAction["rolltable"] = "rolltable";
    ClickAction["rolltable-reset"] = "rolltable-reset";
})(ClickAction || (ClickAction = {}));
/**
 * @abstract
 */
class GmScreenApplicationCommon extends Application {
    constructor(options = {}) {
        super(options);
        this.apps = {};
    }
    /** Configures the ScrollY, GM Drag/Drop, and Tabs for all use cases */
    static get defaultOptions() {
        const { grids, activeGmGridId, applicationData: { columns, rows }, } = GmScreen.dataManager;
        // set all of the cells of all the grids to be scrollY managed
        const scrollY = Object.keys(grids).reduce((acc, gridKey) => {
            const gridColumns = grids[gridKey].columnOverride ?? columns;
            const gridRows = grids[gridKey].rowOverride ?? rows;
            const totalCells = Number(gridColumns) * Number(gridRows);
            const gridKeyScrollY = [...new Array(totalCells)].map((_, index) => `#gm-screen-${gridKey}-cell-${index} .gm-screen-grid-cell-content`);
            return acc.concat(gridKeyScrollY);
        }, []);
        return {
            ...super.defaultOptions,
            ...(game.user?.isGM
                ? {
                    dragDrop: [{ dropSelector: '.gm-screen-grid-cell' }],
                }
                : undefined),
            tabs: [
                {
                    navSelector: '.gm-screen-tabs',
                    contentSelector: '.gm-screen-app',
                    initial: activeGmGridId,
                },
            ],
            template: GmScreen.TEMPLATES.screen,
            id: 'gm-screen-app',
            scrollY,
        };
    }
    /**
     * This currently thinly wraps `this.render`, but might be more complicated in the future.
     */
    refresh() {
        this.render();
    }
    /**
     * Hydrates all visible grids with empty cells in the format the handlebars files wants to display
     */
    get hydratedGridEntries() {
        const grids = GmScreen.dataManager.grids;
        return Object.fromEntries(Object.entries(grids).map(([gridId, gridData]) => {
            return [
                gridId,
                {
                    ...gridData,
                    gridEntries: GmScreen.dataManager.getHydratedGridEntries(gridData),
                },
            ];
        }));
    }
    /**
     * @override
     */
    getData() {
        const { applicationData, hasUserViewableGrids } = GmScreen.dataManager;
        const newAppData = {
            ...super.getData(),
            ...applicationData,
            grids: this.hydratedGridEntries,
            isGM: !!game.user?.isGM,
            hidden: !hasUserViewableGrids,
            drawerMode: GmScreen.dataManager.drawerMode,
        };
        log(false, 'getData', {
            newAppData,
        });
        return newAppData;
    }
    /**
     * Handles actually rendering the application, we want to inject our cells
     * at the end of this method
     * @override
     */
    async _render(...args) {
        const promise = await super._render(...args);
        // stop here if there's no user-viewable grids
        if (!GmScreen.dataManager.hasUserViewableGrids) {
            return promise;
        }
        const html = this.element;
        // add our cell contents to the template now that our application is done rendering
        this.injectCellContents(html);
        // update a few attributes in the rendered html
        const vanillaGridElement = document.querySelector('.gm-screen-grid');
        if (!vanillaGridElement) {
            return;
        }
        const vanillaGridElementStyles = getComputedStyle(vanillaGridElement);
        const cols = vanillaGridElementStyles.gridTemplateColumns.split(' ');
        const colWidth = cols[0];
        $(html)
            .find('.gm-screen-grid')
            .each((i, gridElement) => {
            gridElement.style.setProperty('--grid-cell-width', colWidth);
        });
        // enforce calculated width per cell. this requires a refresh after window dimension changes, though
        const numericColWidth = +colWidth.replace('px', '');
        $(html)
            .find('.gm-screen-grid-cell')
            .each((i, gridElement) => {
            const columnSpanCount = +gridElement.style.getPropertyValue('--column-span-count');
            const gridElementWidth = numericColWidth * columnSpanCount;
            gridElement.style.setProperty('width', gridElementWidth.toString() + 'px');
        });
        return promise;
    }
    /**
     * @override
     */
    activateListeners(html) {
        super.activateListeners(html);
        if (game.user?.isGM) {
            this._reorderDragDropListeners(html);
        }
        $('.gm-screen-button').on('contextmenu', () => {
            const config = new GmScreenSettingsConfig();
            config.render(true);
        });
        $(html).on('click', 'button', this.handleClickEvent.bind(this));
        $(html).on('click', 'a', this.handleClickEvent.bind(this));
    }
    /**
     * Handles the ability to re-order tabs if the user is the GM
     */
    _reorderDragDropListeners(html) {
        let draggedTab;
        const tabElement = html.find('.gm-screen-tabs');
        tabElement.on('dragstart', '.item', (e) => {
            draggedTab = e.target;
        });
        tabElement.on('dragover', (e) => {
            if (!draggedTab) {
                return;
            }
            const children = Array.from($(e.target).closest('.gm-screen-tabs').children());
            if (children.indexOf(e.target) > children.indexOf(draggedTab)) {
                e.target.after(draggedTab);
            }
            else {
                e.target.before(draggedTab);
            }
        });
        tabElement.on('dragend', async (e) => {
            if (!draggedTab) {
                return;
            }
            const newGrids = foundry.utils.deepClone(GmScreen.dataManager.grids);
            // rebuild gmScreenConfig based on the current layout of the tabs
            $(e.target)
                .closest('.gm-screen-tabs')
                .children()
                .each((index, item) => {
                const gridId = $(item).attr('data-tab');
                if (!gridId) {
                    return;
                }
                newGrids[gridId] = GmScreen.dataManager.grids[gridId];
            });
            draggedTab = undefined;
            await game.settings.set(MODULE_ID, GmScreen.SETTINGS.gmScreenConfig, {
                activeGridId: GmScreen.dataManager.activeGmGridId,
                grids: newGrids,
            });
        });
    }
    /**
     * Handles Common Mouse Events for all types of gm screen
     */
    async handleClickEvent(e) {
        e.preventDefault();
        const action = e.currentTarget.dataset.action;
        const entityUuid = $(e.currentTarget).parents('[data-entity-uuid]')?.data()?.entityUuid;
        const entryId = $(e.currentTarget).parents('[data-entry-id]')?.data()?.entryId;
        log(false, 'handleClickEvent', {
            e,
            action,
        });
        switch (action) {
            case ClickAction.clearCell: {
                if (!entryId) {
                    return;
                }
                GmScreen.dataManager.removeEntryFromActiveGrid(entryId);
                break;
            }
            case ClickAction.configureCell: {
                const coordinates = GmScreenApplicationCommon.getGridElementsPosition($(e.target).parent());
                GmScreenCell._onConfigureGridEntry(coordinates, entryId);
                break;
            }
            case ClickAction.open: {
                GmScreenCell._onClickOpen(entityUuid);
                break;
            }
            case ClickAction.setActiveGridId: {
                const newActiveGridId = e.currentTarget.dataset.tab;
                await GmScreen.dataManager.setActiveGmGridId(newActiveGridId);
                // this.refresh();
                break;
            }
            case ClickAction.rolltable: {
                if (!entityUuid || !entryId) {
                    break;
                }
                const cellClassInstance = (await this.getCellApplicationClass(entityUuid, entryId));
                await cellClassInstance._rollOnTable();
            }
        }
    }
    /**
     * @override
     */
    _canDragDrop() {
        return !!game.user?.isGM;
    }
    /**
     * Handles the dropping of a document onto a grid cell
     * @override
     */
    _onDrop(event) {
        event.stopPropagation();
        // do nothing if this user is not the gm
        if (!game.user?.isGM)
            return;
        // type safety checks
        if (!event.currentTarget || !event.target || !event.dataTransfer)
            return;
        // Try to extract the data
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        }
        catch (err) {
            return;
        }
        log(false, 'onDrop', {
            event,
            data,
            closestGridCell: $(event.currentTarget).closest('.gm-screen-grid-cell'),
        });
        // only move forward if dropped entry is of a supported type
        if (!['JournalEntry', 'JournalEntryPage', 'RollTable', 'Item', 'Actor'].includes(data.type)) {
            return;
        }
        const entityUuid = data.uuid;
        const gridElementPosition = GmScreenApplicationCommon.getGridElementsPosition($(event.target).closest('.gm-screen-grid-cell'));
        const newEntryId = `${gridElementPosition.x}-${gridElementPosition.y}`;
        const newEntry = {
            ...gridElementPosition,
            entryId: newEntryId,
            entityUuid,
        };
        GmScreen.dataManager.addEntryToActiveGrid(newEntry);
    }
    /**
     * Injects cell applications during _renderInner;
     * Handles finding all cells in the html and injecting their rightful contents based on
     * data attributes which detail the uuid of the document within
     */
    injectCellContents(html) {
        const allCells = $(html).find('[data-entity-uuid]');
        log(false, 'injectCellContents', allCells);
        allCells.each((index, gridEntry) => {
            try {
                // `this` is the parent .gm-screen-grid-cell
                const relevantUuid = gridEntry.dataset.entityUuid;
                if (!relevantUuid) {
                    return;
                }
                const cellId = `#${gridEntry.id}`;
                log(false, 'gridEntry with uuid defined found', { relevantUuid, cellId, gridEntry });
                this.getCellApplicationClass(relevantUuid, cellId)
                    .then((application) => {
                    log(false, `got application for "${cellId}"`, {
                        application,
                    });
                    if (!application) {
                        throw new Error('no application exists to render');
                    }
                    const classes = application.options.classes.join(' ');
                    const gridCellContent = $(gridEntry).find('.gm-screen-grid-cell-content');
                    gridCellContent.addClass(classes);
                    // actually render the application
                    application.render(true);
                })
                    .catch((e) => {
                    log(true, 'error trying to render a gridEntry', {
                        gridEntry,
                        cellId,
                        relevantUuid,
                        error: e,
                    });
                });
            }
            catch (e) {
                log(false, 'erroring', e, {
                    gridEntry,
                });
            }
        });
        updateCSSPropertyVariable(html, '.gm-screen-grid-cell', 'width', '--this-cell-width');
        return html;
    }
    /**
     * create and cache the custom Application when we need to during GmScreenApplication.render();
     * and then use that cached Application instance to render
     *
     * @param documentUuid - Identifier for the Entity in the cell
     * @param cellId - Identifier for the Cell
     * @param gridCellContentElement - the element to inject into
     * @returns the instance of the document's sheet to render
     */
    async getCellApplicationClass(documentUuid, cellId) {
        const relevantDocument = await GmScreenDataManager.getRelevantGmScreenDocument(documentUuid);
        // if the document does not exist, 'close' the application and destroy the cached copy
        if (!relevantDocument) {
            await this.apps[cellId]?.close();
            delete this.apps[cellId];
            console.warn('One of the grid cells tried to render a document that does not exist. Perhaps it was deleted or is in a compendium module that is not active?', documentUuid);
            return;
        }
        /* If there is an old app in this cell which does not belong to this document, 'close' that application and destroy its cache entry */
        if (this.apps[cellId] && this.apps[cellId]?.object.uuid !== documentUuid) {
            await this.apps[cellId].close();
            delete this.apps[cellId];
        }
        // gets the relevant document's GM Screen Sheet class constructor based on any present overrides
        const SheetClassConstructor = (GmScreenCell._getGridEntrySheetClass(relevantDocument) ??
            relevantDocument.sheet?.constructor);
        /* If the currently cached application does not match the sheet class, 'close' that application and destroy its cache entry */
        if (this.apps[cellId] && this.apps[cellId].constructor.name !== SheetClassConstructor?.name) {
            await this.apps[cellId].close();
            delete this.apps[cellId];
        }
        /* If the currently cached application does match the expected sheet class, return it */
        if (this.apps[cellId] && this.apps[cellId].constructor.name === SheetClassConstructor?.name) {
            log(false, `using cached application instance for "${relevantDocument.name}"`, {
                entityUuid: documentUuid,
                app: this.apps[cellId],
            });
            return this.apps[cellId];
        }
        /** Otherwise, we need to make a new instance of the sheet class retrieved */
        log(false, 'relevantEntity sheet', {
            sheetClassConstructor: SheetClassConstructor,
            name: SheetClassConstructor?.name,
        });
        if (!SheetClassConstructor) {
            throw new Error('Could not create cell application as the constructor does not exist');
        }
        // // TODO: FIXME in _getGmScreenSheetClass
        // if (SheetClassConstructor.name === 'RollTableConfig') {
        //   log(false, `creating compact rollTableDisplay for "${relevantDocument.name}"`, {
        //     cellId,
        //   });
        //   this.apps[cellId] = new CompactRollTableDisplay(relevantDocument, { cellId });
        //   return this.apps[cellId];
        // }
        log(false, `creating compact generic for "${relevantDocument.name}"`, {
            cellId,
        });
        const CompactDocumentSheet = new SheetClassConstructor(relevantDocument, {
            editable: false,
        });
        // apply all the right overrides to the sheet class so it renders inside the grid
        GmScreenCell.applyGmScreenCellSheetOverrides(CompactDocumentSheet, cellId);
        log(false, `created compact generic for "${relevantDocument.name}"`, {
            sheet: CompactDocumentSheet,
        });
        this.apps[cellId] = CompactDocumentSheet;
        return this.apps[cellId];
    }
    toggleGmScreenVisibility() {
        throw new Error('Each GM Screen subclass must implemement this method');
    }
    /**
     * Gets the given element's X/Y coordinates in the grid
     */
    static getGridElementsPosition(element) {
        const relevantGridElement = element.parents('.gm-screen-grid')[0];
        const vanillaGridElementStyles = window.getComputedStyle(relevantGridElement);
        log(false, 'getGridElementsPosition', {
            element,
            relevantGridElement,
            vanillaGridElementStyles,
            gap: vanillaGridElementStyles.gap,
            gridRowGap: vanillaGridElementStyles.rowGap,
            gridColGap: vanillaGridElementStyles.columnGap,
        });
        const numberRegex = /([+-]?(?=\.\d|\d)(?:\d+)?(?:\.?\d*))(?:[eE]([+-]?\d+))?/;
        const gap = Number(vanillaGridElementStyles.rowGap.match(numberRegex)?.[0]);
        //Get the css attribute grid-template-columns from the css of class grid
        //split on whitespace and get the length, this will give you the column dimensions
        const cols = vanillaGridElementStyles.gridTemplateColumns.split(' ');
        const colWidth = Number(cols[0].match(numberRegex)?.[0]);
        //Get the css attribute grid-template-rows from the css of class grid
        //split on whitespace and get the length, this will give you the column dimensions
        const rows = vanillaGridElementStyles.gridTemplateRows.split(' ');
        const rowHeight = Number(rows[0].match(numberRegex)?.[0]);
        // to figure out which column/row this element is in within the gridElement, we have to do math
        const elementBounds = element[0].getBoundingClientRect();
        const gridBounds = relevantGridElement.getBoundingClientRect();
        const elementColumn = Math.floor((elementBounds.left - (gridBounds.left - gap)) / (colWidth + gap)) + 1;
        const elementRow = Math.floor((elementBounds.top - (gridBounds.top - gap)) / (rowHeight + gap)) + 1;
        log(false, 'getGridElementsPosition', {
            setup: {
                gap,
                cols,
                rows,
                elementBounds,
                gridBounds,
                colWidth,
                rowHeight,
            },
            results: {
                elementColumn,
                elementRow,
            },
        });
        //Return an object with properties row and column
        return { y: elementRow, x: elementColumn };
    }
}
/** Extends the base GM Screen Application for the Popout Case */
class GmScreenApplicationPopout extends GmScreenApplicationCommon {
    static get defaultOptions() {
        const { columns, rows } = GmScreen.dataManager.applicationData;
        return {
            ...super.defaultOptions,
            classes: ['gm-screen-popOut'],
            popOut: true,
            width: Number(columns) * 400,
            height: Number(rows) * 300,
            resizable: true,
            title: game.i18n.localize(`${MODULE_ABBREV}.gmScreen.Title`),
        };
    }
    /** Handle toggling gm screens */
    toggleGmScreenVisibility(shouldOpen = !this.rendered) {
        if (shouldOpen) {
            if (!this.rendered) {
                this.render(true);
            }
            else {
                this.bringToTop();
            }
        }
        if (!shouldOpen) {
            this.close();
        }
        // on open, call MyHooks.openClose with isOpen: true and the active grid details
        Hooks.callAll(GmScreen.HOOKS.openClose, this, {
            isOpen: this.rendered,
            activeGridId: GmScreen.dataManager.activeGmGridId,
            activeGridName: GmScreen.dataManager.activeGmGrid?.name,
        });
    }
    /**
     * @override
     */
    _getHeaderButtons() {
        const superButtons = super._getHeaderButtons();
        const gmButtons = [
            {
                label: game.i18n.localize(`${MODULE_ABBREV}.gmScreen.Reset`),
                class: 'clear',
                icon: 'fas fa-ban',
                onclick: () => GmScreen.dataManager.clearActiveGrid(), // TODO: `this.apps = {};` ?
            },
        ];
        return [
            ...(game.user?.isGM ? gmButtons : []),
            {
                label: game.i18n.localize(`${MODULE_ABBREV}.gmScreen.Refresh`),
                class: 'refresh',
                icon: 'fas fa-sync',
                onclick: () => GmScreen.dataManager.refresh.bind(this)(),
            },
            ...superButtons,
        ];
    }
}
/** Extends the base GM Screen Application for the Drawer Case */
class GmScreenApplicationDrawer extends GmScreenApplicationCommon {
    constructor() {
        super(...arguments);
        this.expanded = false;
    }
    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            popOut: false,
        };
    }
    getData() {
        return {
            ...super.getData(),
            expanded: this.expanded,
        };
    }
    // TODO ??? Still needed ???
    activateListeners(html) {
        super.activateListeners(html);
        // bring to top on click
        $(html).on('mousedown', (event) => {
            log(false, 'buttons', event.buttons);
            if (event.buttons === 2) {
                return;
            }
            this.bringToTop();
        });
    }
    /**
     * Set the GM Screen Visibility. By default will toggle the current state.
     * @param {boolean} expanded
     */
    toggleGmScreenVisibility(expanded = !this.expanded) {
        // TODO: Allow toggling open to a specific tab
        // TODO: Provide API for other modules to know what tabs exist
        this.expanded = expanded;
        const activeGridDetails = {
            activeGridId: GmScreen.dataManager.activeGmGridId,
            activeGridName: GmScreen.dataManager.activeGmGrid?.name,
        };
        if (this.expanded) {
            ui.windows[this.appId] = this; // add our window to the stack, pretending we are an open Application
            this.bringToTop();
            $('.gm-screen-app').addClass('expanded');
            // on open, call MyHooks.openClose with isOpen: true and the active grid details
            Hooks.callAll(GmScreen.HOOKS.openClose, this, {
                isOpen: true,
                ...activeGridDetails,
            });
        }
        else {
            $('.gm-screen-app').removeClass('expanded');
            delete ui.windows[this.appId]; // remove our window to the stack, pretending we are a closed Application
            // on open, call MyHooks.openClose with isOpen: false and the active grid details
            Hooks.callAll(GmScreen.HOOKS.openClose, this, {
                isOpen: false,
                ...activeGridDetails,
            });
        }
    }
    async handleClickEvent(e) {
        super.handleClickEvent(e);
        const action = e.currentTarget.dataset.action;
        switch (action) {
            case ClickAction.clearGrid: {
                GmScreen.dataManager.clearActiveGrid();
                break;
            }
            case ClickAction.refresh: {
                GmScreen.dataManager.refresh();
                break;
            }
            case ClickAction['toggle-gm-screen']: {
                try {
                    this.toggleGmScreenVisibility();
                }
                catch (error) {
                    log(true, 'error toggling GM Screen', error);
                }
                break;
            }
        }
    }
}

class GmScreen {
    /**
     * handle the init hook
     * Register all settings needed for GM Screen Initialization
     * */
    static init() {
        this.registerSettings();
        this.preloadTemplates();
    }
    /**
     * Handle Ready hook
     * Render the drawer mode screen
     * put the module api into the moduledata
     */
    static ready() {
        // Do anything once the module is ready
        if (this.dataManager.drawerMode) {
            log(false, 'readying', { drawerMode: this.dataManager.drawerMode, app: this.gmScreenApp });
            this.gmScreenApp.render(true);
        }
        const gmScreenModuleData = game.modules.get(MODULE_ID);
        if (gmScreenModuleData) {
            gmScreenModuleData.api = this.gmScreenApi;
        }
        if (game.user?.isGM) {
            game.settings.set(MODULE_ID, this.SETTINGS.reset, false);
        }
        Hooks.callAll(this.HOOKS.ready);
    }
    /**
     * Get or Create a new instance of GmScreenDataManager and cache it
     */
    static get dataManager() {
        if (!this._dataManager) {
            this._dataManager = new GmScreenDataManager();
        }
        return this._dataManager;
    }
    /**
     * Get or Create a new instance of GmScreenDataManager and cache it
     */
    static get gmScreenApp() {
        // TOOD: Is this the best play with a drawer-mode setting that can change?
        if (!this._gmScreenApp) {
            this._gmScreenApp = this.dataManager.drawerMode
                ? new GmScreenApplicationDrawer()
                : new GmScreenApplicationPopout();
        }
        return this._gmScreenApp;
    }
    /**
     * Get the public api for the gm screen
     */
    static get gmScreenApi() {
        return {
            toggleGmScreenVisibility: this.gmScreenApp.toggleGmScreenVisibility,
            refreshGmScreen: this.dataManager.refresh,
        };
    }
    /** Asynchronously preload templates */
    static async preloadTemplates() {
        return loadTemplates(Object.values(flattenObject(this.TEMPLATES)));
    }
    /** Register all settings needed for GM Screen Initialization */
    static registerSettings() {
        game.settings.registerMenu(MODULE_ID, 'menu', {
            name: `${MODULE_ABBREV}.settings.${this.SETTINGS.gmScreenConfig}.Name`,
            label: `${MODULE_ABBREV}.settings.${this.SETTINGS.gmScreenConfig}.Label`,
            icon: 'fas fa-table',
            type: GmScreenSettingsConfig,
            restricted: true,
            hint: `${MODULE_ABBREV}.settings.${this.SETTINGS.gmScreenConfig}.Hint`,
        });
        game.settings.register(MODULE_ID, this.SETTINGS.gmScreenConfig, {
            default: defaultGmScreenData,
            type: defaultGmScreenData.constructor,
            scope: 'world',
            config: false,
            onChange: () => {
                game.modules.get(MODULE_ID)?.api?.refreshGmScreen();
            },
        });
        game.settings.register(MODULE_ID, this.SETTINGS.migrated, {
            config: false,
            default: { status: false, version: '1.2.2' },
            scope: 'world',
            type: Object,
        });
        game.settings.register(MODULE_ID, this.SETTINGS.columns, {
            name: `${MODULE_ABBREV}.settings.${this.SETTINGS.columns}.Name`,
            default: 4,
            type: Number,
            scope: 'world',
            config: true,
            hint: `${MODULE_ABBREV}.settings.${this.SETTINGS.columns}.Hint`,
        });
        game.settings.register(MODULE_ID, this.SETTINGS.rows, {
            name: `${MODULE_ABBREV}.settings.${this.SETTINGS.rows}.Name`,
            default: 3,
            type: Number,
            scope: 'world',
            config: true,
            hint: `${MODULE_ABBREV}.settings.${this.SETTINGS.rows}.Hint`,
        });
        game.settings.register(MODULE_ID, this.SETTINGS.displayDrawer, {
            name: `${MODULE_ABBREV}.settings.${this.SETTINGS.displayDrawer}.Name`,
            default: true,
            type: Boolean,
            scope: 'client',
            config: true,
            hint: `${MODULE_ABBREV}.settings.${this.SETTINGS.displayDrawer}.Hint`,
            onChange: debouncedReload,
        });
        game.settings.register(MODULE_ID, this.SETTINGS.rightMargin, {
            name: `${MODULE_ABBREV}.settings.${this.SETTINGS.rightMargin}.Name`,
            default: 0,
            type: Number,
            scope: 'client',
            range: { min: 0, max: 75, step: 5 },
            config: true,
            hint: `${MODULE_ABBREV}.settings.${this.SETTINGS.rightMargin}.Hint`,
        });
        game.settings.register(MODULE_ID, this.SETTINGS.drawerWidth, {
            name: `${MODULE_ABBREV}.settings.${this.SETTINGS.drawerWidth}.Name`,
            default: 100,
            type: Number,
            scope: 'client',
            range: { min: 25, max: 100, step: 1 },
            config: true,
            hint: `${MODULE_ABBREV}.settings.${this.SETTINGS.drawerWidth}.Hint`,
        });
        game.settings.register(MODULE_ID, this.SETTINGS.drawerHeight, {
            name: `${MODULE_ABBREV}.settings.${this.SETTINGS.drawerHeight}.Name`,
            default: 60,
            type: Number,
            scope: 'client',
            range: { min: 10, max: 90, step: 1 },
            config: true,
            hint: `${MODULE_ABBREV}.settings.${this.SETTINGS.drawerHeight}.Hint`,
        });
        game.settings.register(MODULE_ID, this.SETTINGS.drawerOpacity, {
            name: `${MODULE_ABBREV}.settings.${this.SETTINGS.drawerOpacity}.Name`,
            default: 1,
            type: Number,
            scope: 'client',
            range: { min: 0.1, max: 1, step: 0.05 },
            config: true,
            hint: `${MODULE_ABBREV}.settings.${this.SETTINGS.drawerOpacity}.Hint`,
        });
        game.settings.register(MODULE_ID, this.SETTINGS.condensedButton, {
            name: `${MODULE_ABBREV}.settings.${this.SETTINGS.condensedButton}.Name`,
            default: false,
            type: Boolean,
            scope: 'client',
            config: true,
            hint: `${MODULE_ABBREV}.settings.${this.SETTINGS.condensedButton}.Hint`,
        });
        game.settings.register(MODULE_ID, this.SETTINGS.reset, {
            name: `${MODULE_ABBREV}.settings.${this.SETTINGS.reset}.Name`,
            default: false,
            type: Boolean,
            scope: 'world',
            config: true,
            hint: `${MODULE_ABBREV}.settings.${this.SETTINGS.reset}.Hint`,
            onChange: (selected) => {
                if (selected) {
                    game.settings.set(MODULE_ID, this.SETTINGS.gmScreenConfig, defaultGmScreenData);
                }
            },
        });
    }
}
GmScreen.TEMPLATES = {
    settings: `modules/${MODULE_ID}/templates/settings.hbs`,
    screen: `modules/${MODULE_ID}/templates/screen.hbs`,
    screenCell: `modules/${MODULE_ID}/templates/parts/screen-cell.hbs`,
    screenGrid: `modules/${MODULE_ID}/templates/parts/screen-grid.hbs`,
    compactRollTable: `modules/${MODULE_ID}/templates/parts/compact-roll-table.hbs`,
    compactJournalEntry: `modules/${MODULE_ID}/templates/parts/compact-journal-entry.hbs`,
    entitySheetInjection: `modules/${MODULE_ID}/templates/parts/entity-sheet-injection.hbs`,
    grids: {
        tableRow: `modules/${MODULE_ID}/templates/parts/settings-grid-config-table-row.hbs`,
    },
};
GmScreen.HOOKS = MyHooks$1;
GmScreen.SETTINGS = MySettings$1;
GmScreen.FLAGS = MyFlags;

// Initialize module
Hooks.once('init', async () => {
    console.log('gm-screen | Initializing GM Screen');
    GmScreen.init();
});
// When ready
Hooks.once('ready', async () => {
    GmScreen.ready();
});
Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
    registerPackageDebugFlag(MODULE_ID);
});
/* Entity Sheet Override */
Hooks.on('renderDocumentSheetConfig', async (app, html, data) => {
    if (!game.user?.isGM) {
        return;
    }
    const htmlToInject = await renderTemplate(GmScreen.TEMPLATES['entitySheetInjection'], {
        ...data,
        gmScreenSheetClass: app.object.getFlag(MODULE_ID, 'gmScreenSheetClass'),
    });
    log(false, 'rendering entity sheet config', {
        htmlToInject,
        target: html.find('[name=submit]'),
        current: app.object.getFlag(MODULE_ID, 'gmScreenSheetClass'),
    });
    html.find('[name=submit]').before(htmlToInject);
    html.on('change', 'select[name=gmScreenSheetClass]', (event) => {
        log(false, 'custom change listener firing', {
            event,
            value: event.target.value,
        });
        app.object.setFlag(MODULE_ID, 'gmScreenSheetClass', event.target.value);
    });
    app.setPosition({ height: 'auto' });
});
/**
 * Hacky way to ensure our drawer stays in the right place as the sidebar collapses and uncollapses
 */
Hooks.on('collapseSidebar', () => {
    const uiRight = document.querySelector('#ui-right');
    if (!uiRight) {
        return;
    }
    const uiRightStyles = getComputedStyle(uiRight);
    document.querySelector('body')?.style.setProperty('--gm-screen-ui-right-width', uiRightStyles.width);
});
/***************************/
// HANDLEBARS HELPERS
Handlebars.registerHelper(`${MODULE_ABBREV}-path`, (relativePath) => {
    return `modules/${MODULE_ID}/${relativePath}`;
});
/*
 * https://stackoverflow.com/questions/53398408/switch-case-with-default-in-handlebars-js
 * {{#switch 'a'}}
 *   {{#case 'a'}} A {{/case}}
 *   {{#case 'b'}} B {{/case}}
 * {{/switch}}
 */
Handlebars.registerHelper(`${MODULE_ABBREV}-switch`, function (value, options) {
    //@ts-expect-error handlebars things
    this.switch_value = value;
    //@ts-expect-error handlebars things
    return options.fn(this);
});
Handlebars.registerHelper(`${MODULE_ABBREV}-case`, function (value, options) {
    //@ts-expect-error handlebars things
    if (value == this.switch_value) {
        //@ts-expect-error handlebars things
        return options.fn(this);
    }
});
Handlebars.registerHelper(`${MODULE_ABBREV}-enrich`, function (str) {
    return TextEditor.enrichHTML(str);
});
//# sourceMappingURL=foundryvtt-gmScreen.js.map
