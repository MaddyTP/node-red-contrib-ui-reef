const util = require('util');
const vm = require('vm');
const path = require('path');
module.exports = function (RED) {
  function HTML(config) {
    delete config.func;
    config.id = config.id.replace('.', '_');
    const configAsJson = JSON.stringify(config);
    const html = String.raw`
      <style>
          .ui-output-slider-${config.id}{
              width: calc((100% - (${config.options.length} * 0.2em)) / ${config.options.length});
          }
          .ui-output-button-${config.id}{
              width:calc(100% / ${config.options.length}); 
          }
      </style>
      <link href='ui-reef/css/uireef.css' rel='stylesheet' type='text/css'>
      <div class="ui-output-container" ng-init='init(${configAsJson})'>
          <div ng-if="${config.label !== ''}" class="ui-output-header">
              <div>${config.label}</div>
              <div>
                  <span class="ui-output-input">{{inputState}}</span>
              </div>
          </div>
          <div id="uiOutputContainer_${config.id}" class="ui-output-wrapper ui-output-round">
              <div id="uiOutputBody_${config.id}"" class="ui-output-body">
                  <div id="uiOutputSliderWrapper_${config.id}" class="ui-output-slider-wrapper">
                      <div id="uiOutputSlider_${config.id}" class="ui-output-slider ui-output-round ui-output-slider-${config.id}"></div>
                  </div>
                  <!-- The radio buttons will be inserted here dynamically on the frontend side -->
              </div>
          </div>
      </div>
      `;
    return html;
  }
  function sendResults(node, msgs, state) {
    if (msgs == null) { return; }
    if (!util.isArray(msgs)) {
      msgs = [msgs];
    }
    let msgCount = 0;
    for (let m = 0; m < msgs.length; m += 1) {
      if (msgs[m]) {
        if (!util.isArray(msgs[m])) {
          msgs[m] = [msgs[m]];
        }
        for (let n = 0; n < msgs[m].length; n += 1) {
          const msg = msgs[m][n];
          if (msg !== null && msg !== undefined) {
            if (typeof msg === 'object' && !Buffer.isBuffer(msg) && !util.isArray(msg)) {
              msg._msgid = RED.util.generateId();
              msg.state = state;
              if(msg.hasOwnProperty('toFront')){ 
                node.emit('input', { 
                  toFront: msg.toFront,
                  state: state,
                });
              }
              msgCount += 1;
            } else {
              let type = typeof msg;
              if (type === 'object') {
                type = Buffer.isBuffer(msg) ? 'Buffer' : (util.isArray(msg) ? 'Array' : 'Date');
              }
              node.error(RED._('node-red:function.error.non-message-returned', { type }));
            }
          }
        }
      }
    }
    if (msgCount > 0) {
      node.send(msgs);
    }
  }
  function createVMOpt(node, kind) {
    const opt = {
      filename: 'uiOutput node' + kind + ':' + node.id + (node.name ? ' [' + node.name + ']' : ''),
      displayErrors: true,
    };
    return opt;
  }
  function updateErrorInfo(err) {
    if (err.stack) {
      const stack = err.stack.toString();
      const m = /^([^:]+):([^:]+):(\d+).*/.exec(stack);
      if (m) {
        const line = parseInt(m[3], 10) - 1;
        let kind = 'body:';
        err.message += ' (' + kind + 'line ' + line + ')';
      }
    }
  }
  function OutletNode(config) {
    this.interval_id = null;
    this.repeat = config.repeat * parseInt(config.repeatUnit);
    this.state;
    const node = this;
    node.name = config.name;
    node.label = config.label;
    node.topic = config.topic;
    node.func = config.func;
    node.outputs = config.outputs;
    node.libs = config.libs || [];
    if (RED.settings.functionExternalModules === false && node.libs.length > 0) {
      throw new Error(RED._('node-red:function.error.externalModuleNotAllowed'));
    }
    const functionText = 'var results = null;'
            + 'results = (async function(){ '
            + 'var node = {'
            + 'id:__node__.id,'
            + 'name:__node__.name,'
            + 'outputCount:__node__.outputCount,'
            + 'log:__node__.log,'
            + 'error:__node__.error,'
            + 'warn:__node__.warn,'
            + 'debug:__node__.debug,'
            + 'trace:__node__.trace,'
            + 'on:__node__.on,'
            + 'status:__node__.status,'
            + 'send:function(msgs,cloneMsg){ __node__.send(msgs,cloneMsg);},'
            + '};\n'
            + node.func + '\n'
            + '})();';
    node.outstandingTimers = [];
    node.outstandingIntervals = [];
    node.clearStatus = false;
    const sandbox = {
      console,
      util,
      Buffer,
      Date,
      RED: {
        util: RED.util,
      },
      __node__: {
        id: node.id,
        name: node.name,
        outputCount: node.outputs,
        log: function (...args) {
          node.log(...args);
        },
        error: function (...args) {
          node.error(...args);
        },
        warn: function (...args) {
          node.warn(...args);
        },
        debug: function (...args) {
          node.debug(...args);
        },
        trace: function (...args) {
          node.trace(...args);
        },
        send: function (...args) {
          sendResults(...args);
        },
        on: function (...args) {
          if (args[0] === 'input') {
            throw new Error(RED._('node-red:function.error.inputListener'));
          }
          node.on(...args);
        },
        status: function (...args) {
          node.clearStatus = true;
          node.status(...args);
        },
      },
      context: {
        set: function (...args) {
          node.context().set(...args);
        },
        get: function (...args) { return node.context().get(...args); },
        keys: function (...args) { return node.context().keys(...args); },
        get global() {
          return node.context().global;
        },
        get flow() {
          return node.context().flow;
        },
      },
      flow: {
        set: function (...args) {
          node.context().flow.set(...args);
        },
        get: (...args) => node.context().flow.get(...args),
        keys: (...args) => node.context().flow.keys(...args),
      },
      global: {
        set: function (...args) {
          node.context().global.set(...args);
        },
        get: function (...args) { return node.context().global.get(...args); },
        keys: function (...args) { return node.context().global.keys(...args); },
      },
      env: {
        get: (envVar) => {
          const flow = node._flow;
          return flow.getSetting(envVar);
        },
      },
      setTimeout: function (...args) {
        const func = args[0];
        let timerId;
        args[0] = function () {
          sandbox.clearTimeout(timerId);
          try {
            func(...args);
          } catch (err) {
            node.error(err, {});
          }
        };
        timerId = setTimeout(...args);
        node.outstandingTimers.push(timerId);
        return timerId;
      },
      clearTimeout: function (id) {
        clearTimeout(id);
        const index = node.outstandingTimers.indexOf(id);
        if (index > -1) {
          node.outstandingTimers.splice(index, 1);
        }
      },
      setInterval: function (...args) {
        const func = args[0];
        args[0] = function () {
          try {
            func(...args);
          } catch (err) {
            node.error(err, {});
          }
        };
        const timerId = setInterval(...args);
        node.outstandingIntervals.push(timerId);
        return timerId;
      },
      clearInterval: function (id) {
        clearInterval(id);
        const index = node.outstandingIntervals.indexOf(id);
        if (index > -1) {
          node.outstandingIntervals.splice(index, 1);
        }
      },
    };
    if (util.hasOwnProperty('promisify')) {
      sandbox.setTimeout[util.promisify.custom] = function (after, value) {
        return new Promise(function (resolve, reject) {
          sandbox.setTimeout(function () { resolve(value); }, after);
        });
      };
      sandbox.promisify = util.promisify;
    }
    const moduleLoadPromises = [];
    if (node.hasOwnProperty('libs')) {
      let moduleErrors = false;
      const modules = node.libs;
      modules.forEach(function (module) {
        const vname = module.hasOwnProperty('var') ? module.var : null;
        if (vname && (vname !== '')) {
          if (sandbox.hasOwnProperty(vname) || vname === 'node') {
            node.error(RED._('node-red:function.error.moduleNameError', { name: vname }));
            moduleErrors = true;
            return;
          }
          sandbox[vname] = null;
          const spec = module.module;
          if (spec && (spec !== '')) {
            moduleLoadPromises.push(RED.import(module.module).then(function (lib) {
              sandbox[vname] = lib.default;
            }).catch(function (err) {
              node.error(RED._('node-red:function.error.moduleLoadError', { module: module.spec, error: err.toString() }));
              throw err;
            }));
          }
        }
      });
      if (moduleErrors) {
        throw new Error(RED._('node-red:function.error.externalModuleLoadError'));
      }
    }
    let ui;
    Promise.all(moduleLoadPromises).then(function () {
      const context = vm.createContext(sandbox);
      try {
        if (ui === undefined) {
          ui = RED.require('node-red-dashboard')(RED);
        }
        config.dark = false;
        if (typeof ui.isDark === 'function') {
          config.dark = ui.isDark();
          config.widgetColor = ui.getTheme()['widget-backgroundColor'].value;
        }
        node.script = vm.createScript(functionText, createVMOpt(node, ''));
        RED.nodes.createNode(node, config);
        node.repeater = function (state) {
          const start = process.hrtime();
          node.script.runInContext(context);
          context.results.then(function (results) {
            sendResults(node, results, state);
            const duration = process.hrtime(start);
            const converted = Math.floor((duration[0] * 1e9 + duration[1]) / 10000) / 100;
            node.metric('duration', converted);
          }).catch(function (err) {
            if ((typeof err === 'object') && err.hasOwnProperty('stack')) {
              const index = err.stack.search(/\n\s*at ContextifyScript.Script.runInContext/);
              err.stack = err.stack.slice(0, index).split('\n').slice(0, -1).join('\n');
              const stack = err.stack.split(/\r?\n/);
              let line = 0;
              let errorMessage;
              if (stack.length > 0) {
                while (line < stack.length && stack[line].indexOf('ReferenceError') !== 0) {
                  line += 1;
                }
                if (line < stack.length) {
                  errorMessage = stack[line];
                  const m = /:(\d+):(\d+)$/.exec(stack[line + 1]);
                  if (m) {
                    const lineno = Number(m[1]) - 1;
                    const cha = m[2];
                    errorMessage += ' (line ' + lineno + ', col ' + cha + ')';
                  }
                }
              }
              if (!errorMessage) {
                errorMessage = err.toString();
              }
              node.error(errorMessage);
            }
          });
        };
        node.repeaterSetup = function (state) {
          if (this.repeat && !Number.isNaN(this.repeat) && this.interval_id === null) {
            node.repeater(state);
            this.interval_id = setInterval(function () {
              node.repeater(state);
            }, this.repeat);
            node.outstandingIntervals.push(this.interval_id);
          }
        };
        node.cancelRepeater = function () {
          clearInterval(this.interval_id);
          this.interval_id = null;
        };
        node.sendInitial = function (val) {
          const msg = {};
          msg.payload = val;
          if (config.topic !== '') { msg.topic = config.topic; }
          setTimeout(function () {
            sendResults(node, msg);
          }, 5000);
        };
        config.initOpt = node.context().get('state') || config.options[0];
        switch (config.initOpt.valueType) {
          case ('str'):
            node.sendInitial(config.initOpt.value);
            break;
          case ('num'):
            node.sendInitial(Number(config.initOpt.value));
            break;
          case ('bool'):
            if (config.initOpt.value === 'true') {
              node.sendInitial(true);
            } else {
              node.sendInitial(false);
            }
            break;
          case ('func'):
            node.repeaterSetup();
            break;
          default:
            break;
        }
        const html = HTML(config);
        const ui_done = ui.addWidget({
          node,
          group: config.group,
          order: config.order,
          width: config.width,
          height: config.height,
          format: html,
          templateScope: 'local',
          emitOnlyNewValues: false,
          forwardInputMessages: false,
          storeFrontEndInputAsState: true,
          persistantFrontEndValue: true,
          convertBack: function (value) {
            return value;
          },
          beforeEmit: function (msg, value) {
            const newMsg = {};
            if (msg.toFront) { newMsg.toFront = msg.toFront; }
            newMsg.state = msg.state;
            newMsg.socketid = msg.socketid;
            return { msg: newMsg };
          },
          beforeSend: function (msg, orig) {
            if (orig) {
              const newMsg = {};
              newMsg.payload = orig.msg.payload;
              if (orig.msg.state.valueType === 'func') {
                node.repeaterSetup(orig.msg.state);
                orig._dontSend = true;
              } else {
                node.cancelRepeater();
                if (config.topic !== '') { newMsg.topic = config.topic; }
              }
              return newMsg;
            }
          },
          initController: function ($scope, events) {
            $scope.flag = true;
            $scope.init = function (config) {
              $scope.config = config;
              $scope.containerDiv = $(`#uiOutputContainer_${config.id}`)[0];
              $scope.sliderDivElement = $(`#uiOutputSlider_${config.id}`)[0];
              $scope.sliderWrapperElement = $(`#uiOutputSliderWrapper_${config.id}`)[0];
              const toggleRadioDiv = $scope.containerDiv.firstElementChild;
              config.options.forEach(function (option, index) {
                const divElement = document.createElement('div');
                divElement.setAttribute('class', `ui-output-button ui-output-button-${config.id}`);
                divElement.setAttribute('id', `uiobtn_${config.id}_${index}`);
                divElement.innerHTML = option.label;
                divElement.addEventListener('click', function () {
                  switchStateChanged(option.value, true);
                });
                toggleRadioDiv.appendChild(divElement);
              });
              switchStateChanged(config.initOpt.value, false);
            };
            function txtClassToStandOut(bgColor, light, dark) {
              const color = (bgColor.charAt(0) === '#') ? bgColor.substring(1, 7) : bgColor;
              const r = parseInt(color.substring(0, 2), 16);
              const g = parseInt(color.substring(2, 4), 16);
              const b = parseInt(color.substring(4, 6), 16);
              const uicolors = [r / 255, g / 255, b / 255];
              const c = uicolors.map(function (col) {
                if (col <= 0.03928) {
                  return col / 12.92;
                }
                return ((col + 0.055) / 1.055) ** 2.4;
              });
              const L = (0.2126 * c[0]) + (0.7152 * c[1]) + (0.0722 * c[2]);
              if ($scope.config.dark) {
                return (L > 0.35) ? dark : light;
              }
              return (L > 0.35) ? light : dark;
            }
            function switchStateChanged(newValue, sendMsg) {
              let divIndex = -1;
              $scope.config.options.forEach(function (option, index) {
                if ($(`#uiobtn_${$scope.config.id}_${index}`).length) {
                  $(`#uiobtn_${$scope.config.id}_${index}`).css({ cursor: 'pointer', 'pointer-events': 'auto' });
                  $(`#uiobtn_${$scope.config.id}_${index}`).removeClass('light dark');
                  if (option.value == newValue + '') {
                    $(`#uiobtn_${$scope.config.id}_${index}`).css({ cursor: 'default', 'pointer-events': 'none' });
                    const color = $scope.config.useThemeColors ? $scope.config.widgetColor : option.color ? option.color : $scope.config.widgetColor;
                    $(`#uiobtn_${$scope.config.id}_${index}`).addClass(txtClassToStandOut(color, 'light', 'dark'));
                    divIndex = index;
                  }
                }
              });
              if (divIndex >= 0) {
                let percentage = '0%';
                if ($scope.config.options.length > 0 && divIndex >= 0) {
                  percentage = (100 / $scope.config.options.length) * divIndex;
                  $scope.sliderDivElement.style.left = `${percentage}%`;
                  if ($scope.config.useThemeColors !== true) {
                    $scope.sliderDivElement.style.backgroundColor = $scope.config.options[divIndex].color;
                  }
                }
                if ($scope.config.options[divIndex].valueType === 'num') {
                  newValue = Number(newValue);
                }
                if ($scope.config.options[divIndex].valueType === 'bool') {
                  if (newValue === 'true') {
                    newValue = true;
                  } else {
                    newValue = false;
                  }
                }
                if (sendMsg) {
                  $scope.send({
                    payload: newValue,
                    state: $scope.config.options[divIndex],
                    toFront: newValue,
                  });
                }
              }
            }
            $scope.$watch('msg', function (msg) {
              if (!msg) {
                return;
              }
              if (msg.hasOwnProperty('toFront')) {
                $scope.inputState = msg.toFront.toString();
              }
              switchStateChanged(msg.state.value, false);
            });
          },
        });
        node.on('close', function () {
          while (node.outstandingTimers.length > 0) {
            clearTimeout(node.outstandingTimers.pop());
          }
          while (node.outstandingIntervals.length > 0) {
            clearInterval(node.outstandingIntervals.pop());
          }
          if (node.clearStatus) {
            node.status({});
          }
          ui_done();
        });
      } catch (e) {
        console.log(e);
        updateErrorInfo(e);
        node.error(e);
      }
    });
  }
  RED.nodes.registerType('ui_output', OutletNode);
  const uipath = ((RED.settings.ui || {}).path) || 'ui';
  const libPath = path.join(RED.settings.httpNodeRoot, uipath, '/ui-reef/*').replace(/\\/g, '/');
  RED.httpNode.get(libPath, function (req, res) {
    const options = {
      root: `${__dirname}/lib/`,
      dotfiles: 'deny',
    };
    res.sendFile(req.params[0], options);
  });
};