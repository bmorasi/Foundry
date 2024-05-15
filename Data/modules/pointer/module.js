var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const CONSTANTS = {
  MODULE_ID: "pointer",
  PATH: `modules/pointer/`
};
CONSTANTS.PATH = `modules/${CONSTANTS.MODULE_ID}/`;
const _Pointer = class _Pointer extends PIXI.Container {
  constructor(data = {}, userId = game.userId, gridSize = canvas.grid.size) {
    super();
    this.data = duplicate(data);
    this.userId = userId;
    this.gridSize = gridSize;
    this.draw();
  }
  static get defaultSettings() {
    return this.default("pointer");
  }
  async draw(newData = this.data) {
    if (this._drawing)
      return;
    this._drawing = true;
    const data = this.data;
    if (newData.img) {
      if (this.sprite)
        this.sprite.destroy();
      const tex = await loadTexture(data.img);
      this.sprite = this.addChild(new PIXI.Sprite(tex));
      const src = tex.baseTexture.resource.source;
      if (src.tagName === "VIDEO") {
        src.loop = true;
        src.muted = true;
        game.video.play(src);
      }
      const { height, width } = tex;
      this.sprite.pivot.x = width / 2;
      this.sprite.pivot.y = height / 2;
      newData = this.data;
    }
    if (newData.position) {
      this.position = data.position;
      delete data.position;
    }
    if (newData.scale) {
      const { height, width } = this.sprite.texture;
      const ratio = height / width;
      this.sprite.scale = new PIXI.Point(
        this.gridSize / width * data.scale,
        this.gridSize / height * data.scale * ratio
      );
    }
    if (newData.offset) {
      this.sprite.position = new PIXI.Point(
        data.offset.x * this.gridSize * data.scale,
        data.offset.y * this.gridSize * data.scale
      );
    }
    if (newData.angle) {
      this.sprite.angle = data.angle;
    }
    if (newData.tint) {
      if (this.data.tint.useUser)
        this.sprite.tint = Number("0x" + game.users.get(this.userId).color.slice(1));
      else
        this.sprite.tint = Number("0x" + data.tint.color.slice(1));
    }
    if (newData.animations) {
      this.animations = newData.animations;
      if (this.timeline)
        this.timeline.clear();
      else
        this.timeline = new TimelineMax();
      if (this.animations?.rotation?.use) {
        const rotData = this.animations.rotation;
        const min = rotData.min, max = rotData.max, dur = rotData.dur, yoyo = rotData.yoyo, ease = rotData.easing.method === "none" ? "none" : rotData.easing.method + "." + rotData.easing.type;
        this.timeline.set(this, { angle: min }, 0);
        this.timeline.to(this, dur, { angle: max, ease, repeat: -1, yoyo }, 0);
      } else {
        this.rotation = 0;
      }
      if (this.animations?.scale?.use) {
        const scaleData = this.animations.scale;
        const min = scaleData.min, max = scaleData.max, dur = scaleData.dur, yoyo = scaleData.yoyo, ease = scaleData.easing.method === "none" ? null : scaleData.easing.method + "." + scaleData.easing.type;
        this.timeline.set(this.scale, { x: min, y: min }, 0);
        this.timeline.to(this.scale, dur, { x: max, y: max, ease, repeat: -1, yoyo }, 0);
      } else {
        this.scale = new PIXI.Point(1, 1);
      }
      this.timeline.play();
    }
    this._drawing = false;
  }
  async update(udata) {
    this.data = mergeObject(this.data, duplicate(udata));
    this.draw(expandObject(udata));
    return;
  }
  async save() {
    const collection = duplicate(game.settings.get("pointer", "collection"));
    let idx = collection.findIndex((e) => e.id === this.id);
    const data = duplicate(this.data);
    delete data.position;
    collection[idx] = data;
    return game.settings.set("pointer", "collection", collection);
  }
  hide() {
    this.renderable = false;
  }
  ping(position) {
    return;
  }
  destroy(...args) {
    super.destroy(...args);
    this.timeline?.kill();
  }
};
__name(_Pointer, "Pointer");
let Pointer = _Pointer;
const _Ping = class _Ping extends Pointer {
  draw(newData) {
    this.renderable = true;
    super.draw(newData);
    if (newData?.position) {
      if (!this.timeline)
        this.timeline = new TimelineMax();
      const removeTween = this.timeline.getById("remove");
      if (removeTween) {
        this.timeline.remove(removeTween);
      }
      this.timeline.set(
        this,
        {
          id: "remove",
          onComplete: () => {
            this.renderable = false;
            this.timeline.pause();
          }
        },
        this.pingDuration || 3
      );
      this.timeline.restart();
    } else
      this.renderable = false;
  }
};
__name(_Ping, "Ping");
let Ping = _Ping;
let controls;
function init() {
  const settings = mergeObject(
    PointerSettingsMenu.defaultSettings.controls,
    game.user.getFlag("pointer", "settings")?.controls
  );
  removeListeners();
  setUpControls(settings);
  addListeners();
}
__name(init, "init");
function getKey(event) {
  if (event.code === "Space")
    return event.code;
  if (/^Digit/.test(event.code))
    return event.code[5];
  if (event.location === 3 && (event.code in game.keyboard.moveKeys || event.code in game.keyboard.zoomKeys)) {
    return event.code;
  }
  return event.key;
}
__name(getKey, "getKey");
function setUpControls(settings) {
  controls = { pointer: {}, ping: {}, force: {} };
  for (let objKey of ["ping", "pointer"]) {
    const keys = settings[objKey].key.split(" + ");
    const metaKeys = keys.splice(0, keys.length - 1);
    controls[objKey].meta = {};
    for (const meta of ["Ctrl", "Shift", "Meta", "Alt"])
      controls[objKey].meta[meta.toLowerCase() + "Key"] = metaKeys.includes(meta);
    if (keys[0]?.includes("Click")) {
      controls[objKey].event = "mouse";
      if (keys[0].includes("Left"))
        controls[objKey].button = 0;
      else
        controls[objKey].button = 2;
    } else {
      controls[objKey].event = "key";
      controls[objKey].key = keys[0];
    }
  }
  controls.ping.pointerActive = settings.ping.pointerActive;
  if (game.user.isGM) {
    const keys = settings.ping.force.split(" + ");
    const metaKeys = keys.splice(0, keys.length - 1);
    controls.force.meta = {};
    for (const meta of ["Ctrl", "Shift", "Meta", "Alt"])
      controls.force.meta[meta.toLowerCase() + "Key"] = metaKeys.includes(meta);
    if (keys[0]?.includes("Click")) {
      controls.force.event = "mouse";
      if (keys[0].includes("Left"))
        controls.force.button = 0;
      else
        controls.force.button = 2;
    } else {
      controls.force.event = "key";
      controls.force.key = keys[0];
    }
  }
}
__name(setUpControls, "setUpControls");
function removeListeners() {
  if (!controls)
    return;
  if (controls.pointer.event === "key") {
    window.removeEventListener(`${controls.pointer.event}down`, onPointerDown);
    window.removeEventListener(`${controls.pointer.event}up`, onPointerUp);
  } else {
    window.removeEventListener(`${controls.pointer.event}down`, onPointerDown);
    window.removeEventListener(`${controls.pointer.event}up`, onPointerUp);
  }
  if (controls.ping.event === "key") {
    window.removeEventListener(`${controls.ping.event}down`, onPing);
  } else {
    window.removeEventListener(`${controls.ping.event}down`, onPing);
  }
  if (controls.force.event) {
    if (controls.force.event === "key") {
      window.removeEventListener(`${controls.ping.event}down`, onForcePing);
    } else {
      window.removeEventListener(`${controls.ping.event}down`, onForcePing);
    }
  }
}
__name(removeListeners, "removeListeners");
function addListeners() {
  if (controls.pointer.event === "key") {
    window.addEventListener(`${controls.pointer.event}down`, onPointerDown);
    window.addEventListener(`${controls.pointer.event}up`, onPointerUp);
  } else {
    window.addEventListener(`${controls.pointer.event}down`, onPointerDown);
    window.addEventListener(`${controls.pointer.event}up`, onPointerUp);
  }
  if (controls.ping.event === "key") {
    window.addEventListener(`${controls.ping.event}down`, onPing);
  } else {
    window.addEventListener(`${controls.ping.event}down`, onPing);
  }
  if (controls.force.event) {
    if (controls.force.event === "key") {
      window.addEventListener(`${controls.ping.event}down`, onForcePing);
    } else {
      window.addEventListener(`${controls.ping.event}down`, onForcePing);
    }
  }
}
__name(addListeners, "addListeners");
function checkKey(ev, obj) {
  if (ev.target !== document.body && ev.target !== canvas.app.view)
    return false;
  const key = getKey(ev);
  if (key) {
    if (key?.toUpperCase() !== obj.key?.toUpperCase())
      return false;
  } else {
    if (ev.button !== obj.button)
      return false;
  }
  for (let key2 of Object.keys(obj.meta)) {
    if (obj.meta[key2] !== ev[key2])
      return false;
  }
  ev.preventDefault();
  ev.stopPropagation();
  return true;
}
__name(checkKey, "checkKey");
function onPointerDown(ev) {
  if (ev.repeat)
    return;
  if (!checkKey(ev, controls.pointer) || controls.pointer.active)
    return;
  controls.pointer.active = true;
  canvas.controls.pointer.start();
}
__name(onPointerDown, "onPointerDown");
function onPointerUp(ev) {
  if (ev.key && ev.key.toUpperCase() !== controls.pointer.key.toUpperCase())
    return;
  else if (ev.button && !checkKey(ev, controls.pointer))
    return;
  controls.pointer.active = false;
  canvas.controls.pointer.stop();
}
__name(onPointerUp, "onPointerUp");
function onPing(ev) {
  if (controls.ping.pointerActive && !controls.pointer.active)
    return;
  if (!checkKey(ev, controls.ping))
    return;
  canvas.controls.pointer.ping();
}
__name(onPing, "onPing");
function onForcePing(ev) {
  if (controls.ping.pointerActive && !controls.pointer.active)
    return;
  if (!checkKey(ev, controls.force))
    return;
  canvas.controls.pointer.ping({ force: true });
}
__name(onForcePing, "onForcePing");
const _PointerSettingsMenu = class _PointerSettingsMenu extends FormApplication {
  static get defaultOptions() {
    return {
      ...super.defaultOptions,
      template: "modules/pointer/templates/settings.html",
      height: "auto",
      title: "Pings and Pointers - Settings",
      width: 700,
      classes: ["pointer", "pointer-settings"],
      tabs: [
        {
          navSelector: ".tabs",
          contentSelector: "form",
          initial: "name"
        }
      ],
      submitOnClose: true,
      submitOnChange: true,
      closeOnSubmit: false,
      maxScale: 3,
      pixiOptions: {
        width: 300,
        height: 300,
        transparent: true,
        sharedTicker: true,
        sharedLoader: true
      },
      gridSize: 50
    };
  }
  static get defaultCollection() {
    return [
      {
        name: "Pointer Hand",
        id: "wztq19uwjl",
        scale: 1,
        angle: 0,
        offset: {
          x: 0.5,
          y: 0.5
        },
        tint: {
          useUser: true,
          color: "#ffffff"
        },
        pingDuration: 1,
        animations: {
          rotation: {
            use: false,
            dur: 1,
            easing: {
              method: "none",
              type: "in"
            },
            yoyo: false,
            min: 0,
            max: 180
          },
          scale: {
            use: false,
            dur: 1,
            easing: {
              method: "none",
              type: "in"
            },
            yoyo: false,
            min: 0.5,
            max: 2
          }
        },
        img: "modules/pointer/assets/pointer.svg"
      },
      {
        name: "Ping Round",
        id: "gw4tu2ov86",
        scale: 1,
        angle: 0,
        offset: {
          x: 0,
          y: 0
        },
        tint: {
          useUser: true,
          color: "#ffffff"
        },
        pingDuration: 5,
        animations: {
          rotation: {
            use: true,
            dur: 5,
            easing: {
              method: "none",
              type: "in"
            },
            yoyo: false,
            min: -180,
            max: 180
          },
          scale: {
            use: false,
            dur: 2.5,
            easing: {
              method: "sine",
              type: "inOut"
            },
            yoyo: true,
            min: 1,
            max: 1.5
          }
        },
        img: "modules/pointer/assets/focus.svg",
        gridSize: 50,
        default: "ping"
      },
      {
        name: "Ping Arrows",
        id: "6p55sd7xi3",
        scale: 1,
        angle: 0,
        offset: {
          x: 0,
          y: 0
        },
        tint: {
          useUser: true,
          color: "#ffffff"
        },
        pingDuration: 5,
        animations: {
          rotation: {
            use: false,
            dur: 1,
            easing: {
              method: "none",
              type: "in"
            },
            yoyo: false,
            min: 0,
            max: 180
          },
          scale: {
            use: true,
            dur: 1,
            easing: {
              method: "none",
              type: "in"
            },
            yoyo: true,
            min: 0.9,
            max: 1.3
          }
        },
        img: "modules/pointer/assets/convergence-target.svg"
      },
      {
        name: "Ping Triangle",
        id: "eogjz9yjn3",
        scale: 1,
        angle: 0,
        offset: {
          x: 0,
          y: -0.1
        },
        tint: {
          useUser: true,
          color: "#ffffff"
        },
        pingDuration: 5,
        animations: {
          rotation: {
            use: true,
            dur: 4,
            easing: {
              method: "none",
              type: "in"
            },
            yoyo: false,
            min: -180,
            max: 180
          },
          scale: {
            use: true,
            dur: 1,
            easing: {
              method: "none",
              type: "in"
            },
            yoyo: true,
            min: 0.9,
            max: 1.3
          }
        },
        img: "modules/pointer/assets/triangle-target.svg"
      },
      {
        name: "Pointer Pin",
        id: "dvs2vb9y0y",
        scale: 1,
        angle: -15,
        offset: {
          x: 0.35,
          y: -0.6
        },
        tint: {
          useUser: true,
          color: "#ffffff"
        },
        pingDuration: 1,
        animations: {
          rotation: {
            use: false,
            dur: 1,
            easing: {
              method: "none",
              type: "in"
            },
            yoyo: false,
            min: 0,
            max: 180
          },
          scale: {
            use: true,
            dur: 1.5,
            easing: {
              method: "none",
              type: "in"
            },
            yoyo: true,
            min: 0.9,
            max: 1
          }
        },
        img: "modules/pointer/assets/pin.svg"
      },
      {
        name: "Pointer Arrow",
        id: "6njoyebxpf",
        scale: 1,
        angle: 0,
        offset: {
          x: 0,
          y: -0.5
        },
        tint: {
          useUser: true,
          color: "#ffffff"
        },
        pingDuration: 1,
        animations: {
          rotation: {
            use: false,
            dur: 1,
            easing: {
              method: "none",
              type: "in"
            },
            yoyo: false,
            min: 0,
            max: 180
          },
          scale: {
            use: true,
            dur: 1.5,
            easing: {
              method: "none",
              type: "in"
            },
            yoyo: true,
            min: 0.9,
            max: 1
          }
        },
        img: "modules/pointer/assets/plain-arrow.svg"
      }
    ];
  }
  static get defaultSettings() {
    return {
      controls: {
        pointer: {
          key: "X"
        },
        ping: {
          key: "Left Click",
          force: "Right Click",
          pointerActive: true
        }
      }
    };
  }
  activateListeners(html) {
    super.activateListeners(html);
    html[0].querySelectorAll(".pointer-control-chooser").forEach((e) => this._initControlChooser(e));
    this._initDesigner(html[0].querySelector(".designer"));
    const chooser = html[0].querySelector(".chooser");
    chooser.addEventListener("click", (ev) => {
      let target = ev.target.closest(".pointer-name");
      if (target) {
        this._onClickName(ev);
      }
      target = ev.target.closest(".delete-pointer");
      if (target) {
        const li = target.closest("li");
        let collection = duplicate(game.settings.get("pointer", "collection"));
        const pointerData = li.dataset.pointerId === this.pointer.id ? {} : duplicate(this.pointer.data);
        collection = collection.filter((e) => e.id !== li.dataset.pointerId);
        if (collection.length === 0)
          collection = duplicate(this.constructor.defaultCollection);
        game.settings.set("pointer", "collection", collection).then(async (e) => {
          await this._render();
          this._selectPointer(pointerData);
        });
      }
      target = ev.target.closest(".add-pointer");
      if (target) {
        this._addPointer();
      }
    });
    chooser.querySelectorAll("input").forEach(
      (e) => e.addEventListener("change", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const target = ev.currentTarget;
        const list = target.closest(".chooser");
        const checkboxes = Array.from(list.querySelectorAll(`input[name=${target.name}]`)).filter((e2) => e2 !== target);
        target.checked = true;
        for (let checkbox of checkboxes) {
          checkbox.checked = false;
        }
      })
    );
    if (!game.user.isGM)
      return;
    html[0].querySelector(".pointer-apply-settings").addEventListener("click", async (ev) => {
      const settings = this.userData;
      console.log(settings);
      for (let user of game.users) {
        await user.unsetFlag("pointer", "settings");
        await user.setFlag("pointer", "settings", settings);
      }
      ui.notifications.info("Finished applying settings to all users!");
    });
  }
  async _addPointer() {
    const idx = Math.floor(Math.random() * _PointerSettingsMenu.defaultCollection.length);
    const pointerData = duplicate(_PointerSettingsMenu.defaultCollection[idx]);
    pointerData.name = "New";
    pointerData.id = randomID();
    const collection = duplicate(game.settings.get("pointer", "collection"));
    collection.push(pointerData);
    await game.settings.set("pointer", "collection", collection);
    await this._render(false, {});
    this._selectPointer(pointerData);
  }
  async _onClickName(ev) {
    const li = ev.target.closest(".pointer-selection");
    if (this.canConfigure)
      await this.pointer.save();
    const pointerId = li.dataset.pointerId;
    const collection = game.settings.get("pointer", "collection");
    const pointerData = collection.find((e) => e.id === pointerId);
    this._selectPointer(pointerData);
  }
  async _selectPointer(pointerData) {
    this.pointer.update(pointerData);
    const designer = this.form.querySelector(".designer");
    const flatData = flattenObject(pointerData);
    console.log(flatData);
    for (let key of Object.keys(flatData)) {
      const inp = designer.querySelector(`input[name="pointer.${key}"]`);
      if (!inp)
        continue;
      if (inp.type === "checkbox")
        inp.checked = flatData[key];
      else if (inp.type === "range") {
        inp.value = flatData[key];
        inp.parentNode.querySelector(".range-value").innerText = flatData[key];
      } else
        inp.value = flatData[key];
    }
  }
  _initControlChooser(inp) {
    inp.addEventListener("focusout", (ev) => {
      this._onSubmit(ev);
      this._focusedControl = null;
      ev.preventDefault();
      ev.stopPropagation();
    });
    inp.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (this._focusedControl !== ev.currentTarget) {
        this._focusedControl = ev.currentTarget;
        return;
      }
      ev.currentTarget.value = this._getMetaKeys(ev) + "Left Click";
    });
    inp.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (this._focusedControl !== ev.currentTarget) {
        this._focusedControl = ev.currentTarget;
        return;
      }
      ev.currentTarget.value = this._getMetaKeys(ev) + "Right Click";
    });
    inp.addEventListener("keydown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (this._focusedControl !== ev.currentTarget) {
        this._focusedControl = ev.currentTarget;
        return;
      }
      let key = getKey(ev);
      if (["Control", "Shift", "Alt", "Meta"].includes(key)) {
        ev.currentTarget.value = key;
        return;
      }
      ev.currentTarget.value = this._getMetaKeys(ev) + getKey(ev).toUpperCase();
    });
  }
  _getMetaKeys(ev) {
    let keys = [];
    if (ev.shiftKey)
      keys.push("Shift");
    if (ev.ctrlKey)
      keys.push("Ctrl");
    if (ev.altKey)
      keys.push("Alt");
    if (ev.metaKey)
      keys.push("Meta");
    if (keys.length > 0)
      return keys.join(" + ") + " + ";
    return "";
  }
  get canConfigure() {
    return game.user.can("SETTINGS_MODIFY");
  }
  get userData() {
    return mergeObject(_PointerSettingsMenu.defaultSettings, game.user.getFlag("pointer", "settings") || {});
  }
  getData() {
    let data = super.getData();
    data = mergeObject(data, this.userData);
    data.canConfigure = this.canConfigure;
    data.easingMethod = {
      none: "Linear",
      sine: "Sine",
      expo: "Exponential",
      elastic: "Elastic",
      bounce: "Bounce"
    };
    data.easingType = {
      in: "In",
      out: "Out",
      inOut: "In and Out"
    };
    data.collection = game.settings.get("pointer", "collection");
    if (data.canConfigure && !data.collection.length) {
      data.collection = duplicate(this.constructor.defaultCollection);
      game.settings.set("pointer", "collection", data.collection);
    }
    const userSettings = this.userData;
    let selectedPointer = data.collection.find((e) => e.id === userSettings.pointer);
    if (!userSettings.pointer || !selectedPointer) {
      selectedPointer = data.collection[0];
      userSettings.pointer = selectedPointer.id;
    }
    selectedPointer.selectedAsPointer = true;
    data.pixi = selectedPointer;
    let selectedPing = data.collection.find((e) => e.id === userSettings.ping);
    if (!userSettings.ping || !selectedPing) {
      selectedPing = data.collection[1] || data.collection[0];
      userSettings.ping = selectedPing.id;
    }
    selectedPing.selectedAsPing = true;
    data.isGM = game.user.isGM;
    return data;
  }
  async _updateObject(event, formData) {
    const data = expandObject(formData);
    if (this.canConfigure) {
      data.pointer.img = this.pointer.data.img;
      const pointer = new Pointer(data.pointer);
      pointer.save();
    }
    if (event.currentTarget?.closest(".designer"))
      return;
    let settings = duplicate(this.userData);
    settings = mergeObject(settings, data.user);
    const chooser = this.form.querySelector(".chooser");
    const pingId = chooser.querySelector('input[name="selectedAsPing"]:checked').closest("li").dataset.pointerId;
    settings.ping = pingId;
    const pointerId = chooser.querySelector('input[name="selectedAsPointer"]:checked').closest("li").dataset.pointerId;
    settings.pointer = pointerId;
    await game.user.setFlag("pointer", "settings", settings);
    this.render();
  }
  /** PIXI STUFF */
  _initDesigner(container) {
    container.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("input", this._designerInputChange.bind(this));
      el.addEventListener("wheel", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      });
    });
    if (this._pixiApp) {
      container.querySelector(".canvas-container").appendChild(this._pixiApp.view);
      return;
    }
    const { stage } = this._initPixiApp(container);
    this._pixiApp.view.addEventListener("click", (ev) => {
      new FilePicker({
        type: "imagevideo",
        current: this.pointer.img || "",
        callback: (path) => {
          this.pointer.update({ img: path });
        },
        top: this.position.top + 40,
        left: this.position.left + 10
      }).browse(this.pointer.img);
    });
    const pointerId = this.userData.pointer;
    const collection = game.settings.get("pointer", "collection");
    const pointerData = collection.find((e) => e.id === pointerId) || collection[0];
    pointerData.position = new PIXI.Point(this._pixiApp.view.width / 2, this._pixiApp.view.height / 2);
    this.pointer = stage.addChild(new Pointer(pointerData, game.user.id, this.options.gridSize));
  }
  _designerInputChange(ev) {
    ev.stopPropagation();
    ev.preventDefault();
    let udata = {};
    const val = ev.currentTarget.type === "range" ? Number(ev.currentTarget.value) : ev.currentTarget.type === "checkbox" ? !!ev.currentTarget.checked : ev.currentTarget.value;
    if (ev.currentTarget.type === "range") {
      const rangevalue = ev.currentTarget.parentNode.querySelector(".range-value");
      rangevalue.innerText = ev.currentTarget.value;
    }
    const prop = ev.currentTarget.name.split(".").slice(1).join(".");
    udata[prop] = val;
    this.pointer.update(udata).then(async () => {
      if (prop === "name") {
        const pointerData = this.pointer.data;
        await this.render();
        this._selectPointer(pointerData);
      }
    });
  }
  _initPixiApp(container) {
    const pixiOptions = this.options.pixiOptions;
    const app = new PIXI.Application(pixiOptions);
    this._pixiApp = app;
    container.querySelector(".canvas-container").appendChild(app.view);
    app.view.style.cursor = "pointer";
    const stage = app.stage;
    const grid = app.stage.addChild(new PIXI.Graphics());
    this.grid = grid;
    const gridColor = document.body.classList.contains("dark-mode") ? 11184810 : 6710886;
    const gridSize = this.options.gridSize;
    grid.lineStyle(3, gridColor, 0.8);
    const gridLength = 20 * gridSize;
    for (let x2 = 0; x2 <= gridLength; x2 += gridSize) {
      for (let y2 = 0; y2 <= gridLength; y2 += gridSize) {
        grid.moveTo(x2, 0).lineTo(x2, gridLength).moveTo(0, y2).lineTo(gridLength, y2);
      }
    }
    grid.position = new PIXI.Point(pixiOptions.width * 0.5, pixiOptions.height * 0.5);
    grid.pivot = new PIXI.Point(gridLength * 0.5, gridLength * 0.5);
    const target = app.stage.addChild(new PIXI.Graphics());
    target.lineStyle(5, 13369344, 1);
    const targetSize = gridSize * 0.25;
    const x = pixiOptions.width * 0.5, y = pixiOptions.height * 0.5;
    target.moveTo(x - targetSize, y - targetSize).lineTo(x + targetSize, y + targetSize).moveTo(x - targetSize, y + targetSize).lineTo(x + targetSize, y - targetSize);
    return {
      stage
    };
  }
};
__name(_PointerSettingsMenu, "PointerSettingsMenu");
let PointerSettingsMenu = _PointerSettingsMenu;
const registerSettings = /* @__PURE__ */ __name(function() {
  game.settings.register("pointer", "default", {
    name: "Activate placeables changes.",
    hint: "Changes some behaviours of placeables, like preview snapping to grid. Reload for all connected clients is required for this to take effect if changed!",
    scope: "world",
    config: false,
    default: PointerSettingsMenu.defaultSettings,
    type: Object
  });
  game.settings.registerMenu("pointer", "design-studio", {
    name: game.i18n.localize("POINTER.Settings.Name"),
    label: game.i18n.localize("POINTER.Settings.Button"),
    icon: "fas fa-paint-roller",
    type: PointerSettingsMenu,
    restricted: false
  });
  game.settings.register("pointer", "collection", {
    name: "Collection of all pings and pointers",
    config: false,
    restricted: false,
    scope: "world",
    type: Object,
    default: PointerSettingsMenu.defaultCollection,
    onChange: (data) => {
      canvas.controls.pointer.updateAll();
    }
  });
  game.settings.register(CONSTANTS.MODULE_ID, "debug", {
    name: `${CONSTANTS.MODULE_ID}.setting.debug.name`,
    hint: `${CONSTANTS.MODULE_ID}.setting.debug.hint`,
    scope: "client",
    config: true,
    default: false,
    type: Boolean
  });
}, "registerSettings");
const _ResetSettingsDialog = class _ResetSettingsDialog extends FormApplication {
  constructor(...args) {
    super(...args);
    return new Dialog({
      title: game.i18n.localize(`${CONSTANTS.MODULE_ID}.dialogs.resetsettings.title`),
      content: '<p style="margin-bottom:1rem;">' + game.i18n.localize(`${CONSTANTS.MODULE_ID}.dialogs.resetsettings.content`) + "</p>",
      buttons: {
        confirm: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize(`${CONSTANTS.MODULE_ID}.dialogs.resetsettings.confirm`),
          callback: async () => {
            const worldSettings = game.settings.storage?.get("world")?.filter((setting) => setting.key.startsWith(`${CONSTANTS.MODULE_ID}.`));
            for (let setting of worldSettings) {
              console.log(`Reset setting '${setting.key}'`);
              await setting.delete();
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize(`${CONSTANTS.MODULE_ID}.dialogs.resetsettings.cancel`)
        }
      },
      default: "cancel"
    });
  }
  async _updateObject(event, formData) {
  }
};
__name(_ResetSettingsDialog, "ResetSettingsDialog");
let ResetSettingsDialog = _ResetSettingsDialog;
const _PointerContainer = class _PointerContainer extends PIXI.Container {
  constructor() {
    super();
    this.initUsers();
    this._socket = "module.pointer";
    this._onMouseMove = (ev) => this._mouseMove(ev);
  }
  get deltaTime() {
    return 1e3 / 30;
  }
  static init() {
    if (canvas.scene)
      canvas.controls.pointer = canvas.controls.addChild(new _PointerContainer());
    game.socket.on("module.pointer", _PointerContainer.socketHandler);
    Hooks.on("canvasReady", () => {
      if (canvas.controls.pointer)
        canvas.controls.pointer.destroy({ chidren: true });
      canvas.controls.pointer = canvas.controls.addChild(new _PointerContainer());
    });
  }
  async initUsers() {
    this._users = {};
    for (let user of game.users) {
      const data = this._getUserPointerData(user);
      const pointer = this.addChild(new Pointer(data.pointer, user.id));
      const ping = this.addChild(new Ping(data.ping, user.id));
      ping.hide();
      pointer.hide();
      this._users[user.id] = { pointer, ping };
    }
  }
  _getUserPointerData(user) {
    const collection = game.settings.get("pointer", "collection") || PointerSettingsMenu.defaultCollection;
    const settings = mergeObject(PointerSettingsMenu.defaultSettings, user.getFlag("pointer", "settings"));
    const pointerData = collection.find((e) => e.id === settings.pointer) || collection[0];
    const pingData = collection.find((e) => e.id === settings.ping) || collection[1] || collection[0];
    return { pointer: pointerData, ping: pingData };
  }
  update(user) {
    const data = this._getUserPointerData(user);
    if (!data.pointer || !data.ping)
      return;
    this._users[user.id].pointer.update(data.pointer);
    this._users[user.id].ping.update(data.ping);
  }
  updateAll() {
    for (let user of game.users) {
      this.update(user);
    }
  }
  updateUserColor(user) {
    const pointer = this._users[user.id].pointer;
    pointer.update({ tint: pointer.tint });
    const ping = this._users[user.id].ping;
    ping.update({ tint: ping.tint });
  }
  getMouseWorldCoord() {
    if (isNewerVersion(game.version, 11)) {
      return canvas.mousePosition;
    }
    return canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.stage);
  }
  ping({
    userId = game.user.id,
    position = this.getMouseWorldCoord(),
    force = false,
    scale = canvas.stage.scale.x
  } = {}) {
    const ping = this._users[userId].ping;
    ping.update({ position });
    if (force) {
      canvas.animatePan({ x: position.x, y: position.y, scale });
    }
    if (userId !== game.user.id)
      return;
    const data = {
      senderId: userId,
      position,
      sceneId: canvas.scene.id,
      type: "ping",
      force,
      scale: canvas.stage.scale.x
    };
    game.socket.emit(this._socket, data);
  }
  destroy(options) {
    super.destroy(options);
  }
  static socketHandler(data) {
    if (data.stop) {
      canvas.controls.pointer.hidePointer(data.senderId);
      return;
    } else if (data.sceneId !== canvas.scene.id)
      return;
    else if (data.type === "pointer")
      canvas.controls.pointer.movePointer(data.senderId, data.position);
    else if (data.type === "ping")
      canvas.controls.pointer.ping({
        userId: data.senderId,
        position: data.position,
        force: data.force,
        scale: data.scale
      });
  }
  movePointer(userId, { x, y }) {
    const pointer = this._users[userId].pointer;
    if (pointer.renderable) {
      TweenMax.to(pointer.position, this.deltaTime / 1e3, { x, y });
    } else {
      pointer.renderable = true;
      this._users[userId].pointer.update({ position: { x, y } });
    }
  }
  hidePointer(userId) {
    const pointer = this._users[userId].pointer;
    pointer.hide();
  }
  start() {
    this.lastTime = 0;
    this._mouseMove();
    window.addEventListener("mousemove", this._onMouseMove);
    this._users[game.user.id].pointer.renderable = true;
  }
  stop() {
    window.removeEventListener("mousemove", this._onMouseMove);
    this._users[game.user.id].pointer.renderable = false;
    const data = {
      senderId: game.user.id,
      stop: true
    };
    game.socket.emit(this._socket, data);
  }
  _mouseMove(ev) {
    const { x, y } = this.getMouseWorldCoord();
    this._users[game.user.id].pointer.update({ position: { x, y } });
    const dt = Date.now() - this.lastTime;
    if (dt < this.deltaTime)
      return;
    this.lastTime = Date.now();
    let mdata = {
      senderId: game.user.id,
      position: { x, y },
      sceneId: canvas.scene.id,
      type: "pointer"
    };
    game.socket.emit(this._socket, mdata);
  }
  destroy(...args) {
    super.destroy(...args);
    this.stop();
  }
};
__name(_PointerContainer, "PointerContainer");
let PointerContainer = _PointerContainer;
const initHooks = /* @__PURE__ */ __name(async () => {
}, "initHooks");
const setupHooks = /* @__PURE__ */ __name(async () => {
}, "setupHooks");
const readyHooks = /* @__PURE__ */ __name(() => {
  loadTemplates(["modules/pointer/templates/designer.html"]);
  Hooks.on("updateUser", (entity, udata) => {
    if (udata.color) {
      canvas.controls.pointer.updateUserColor(entity);
    }
    if (udata.flags?.pointer?.settings)
      canvas.controls.pointer.update(entity);
    if (udata.flags?.pointer?.settings?.controls && entity.id === game.user.id)
      init();
  });
  PointerContainer.init();
  init();
  Hooks.on("canvasReady", () => {
    init();
  });
}, "readyHooks");
Hooks.once("init", async () => {
  registerSettings();
  initHooks();
});
Hooks.once("setup", function() {
  setupHooks();
});
Hooks.once("ready", async () => {
  readyHooks();
});
Hooks.once("devModeReady", ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(CONSTANTS.MODULE_ID);
});
function setApi(api) {
  const data = game.modules.get(CONSTANTS.MODULE_ID);
  data.api = api;
}
__name(setApi, "setApi");
function getApi() {
  const data = game.modules.get(CONSTANTS.MODULE_ID);
  return data.api;
}
__name(getApi, "getApi");
function setSocket(socket) {
  const data = game.modules.get(CONSTANTS.MODULE_ID);
  data.socket = socket;
}
__name(setSocket, "setSocket");
function getSocket() {
  const data = game.modules.get(CONSTANTS.MODULE_ID);
  return data.socket;
}
__name(getSocket, "getSocket");
export {
  getApi,
  getSocket,
  setApi,
  setSocket
};
//# sourceMappingURL=module.js.map
