import { preUpdateCombat } from "./combatUpdate.js";
export var libWrapper;
export function initPatching() {
    libWrapper = globalThis.libWrapper;
    libWrapper.register("times-up", "CONFIG.Combat.documentClass.prototype._preUpdate", preUpdateCombat, "WRAPPER");
}
