/* eslint-disable import/no-dynamic-require */
module.exports = (RED) => {
  const util = require('util');
  const vm = require('vm');
  const path = require('path');
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

  // function sendResults(node, _msgid, msgs, cloneFirstMessage) {
  //   if (msgs == null) {
  //     return;
  //   } else if (!Array.isArray(msgs)) {
  //     msgs = [msgs];
  //   }
  //   var msgCount = 0;
  //   for (var m = 0; m < msgs.length; m++) {
  //     if (msgs[m]) {
  //       if (!Array.isArray(msgs[m])) {
  //         msgs[m] = [msgs[m]];
  //       }
  //       for (var n = 0; n < msgs[m].length; n++) {
  //         var msg = msgs[m][n];
  //         if (msg !== null && msg !== undefined) {
  //           if (typeof msg === 'object' && !Buffer.isBuffer(msg) && !Array.isArray(msg)) {
  //             if (msgCount === 0 && cloneFirstMessage !== false) {
  //               msgs[m][n] = RED.util.cloneMessage(msgs[m][n]);
  //               msg = msgs[m][n];
  //             }
  //             msg._msgid = _msgid;
  //             msgCount++;
  //           } else {
  //             var type = typeof msg;
  //             if (type === 'object') {
  //               type = Buffer.isBuffer(msg) ? 'Buffer' : (Array.isArray(msg) ? 'Array' : 'Date');
  //             }
  //             node.error(RED._("function.error.non-message-returned", { type: type }));
  //           }
  //         }
  //       }
  //     }
  //   }
  //   if (msgCount > 0) {
  //     node.send(msgs);
  //   }
  // }

  function createVMOpt(node, kind) {
    var opt = {
      filename: 'Function node' + kind + ':' + node.id + (node.name ? ' [' + node.name + ']' : ''),
      displayErrors: true
    };
    return opt;
  }

  function updateErrorInfo(err) {
    if (err.stack) {
      var stack = err.stack.toString();
      var m = /^([^:]+):([^:]+):(\d+).*/.exec(stack);
      if (m) {
        var line = parseInt(m[3]) - 1;
        var kind = "body:";
        if (/setup/.exec(m[1])) {
          kind = "setup:";
        }
        if (/cleanup/.exec(m[1])) {
          kind = "cleanup:";
        }
        err.message += " (" + kind + "line " + line + ")";
      }
    }
  }

  let ui;

  function OutletNode(config) {
    this.interval_id = null;
    this.repeat = config.repeat * 1000;
    const node = this;
    node.name = config.name;
    node.func = config.func;
    node.outputs = config.outputs
    node.libs = config.libs || [];
    node.outstandingTimers = [];
    node.outstandingIntervals = [];
    node.clearStatus = false;

    if (RED.settings.functionExternalModules !== true && node.libs.length > 0) {
      throw new Error(RED._("function.error.externalModuleNotAllowed"));
    }

    try {
      if (ui === undefined) {
        ui = RED.require('node-red-dashboard')(RED);
      }

      config.dark = false;
      if (typeof ui.isDark === 'function') {
        config.dark = ui.isDark();
        config.widgetColor = ui.getTheme()['widget-backgroundColor'].value;
      }

      RED.nodes.createNode(this, config);

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
          log: (...args) => {
            node.log(...args);
          },
          error: (...args) => {
            node.error(...args);
          },
          warn: (...args) => {
            node.warn(...args);
          },
          debug: (...args) => {
            node.debug(...args);
          },
          trace: (...args) => {
            node.trace(...args);
          },
          send: (result) => {
            var newMsg = {};
            newMsg.payload = result;
            node.send(newMsg);
            //sendResults(node, id, msgs, cloneMsg);
          },
          on: () => {
            if (arguments[0] === "input") {
              throw new Error(RED._("function.error.inputListener"));
            }
            node.on(...args);
          },
          status: (...args) => {
            node.clearStatus = true;
            node.status(...args);
          },
        },
        context: {
          set: (...args) => {
            node.context().set(...args);
          },
          get: (...args) => node.context().get(...args),
          keys: (...args) => node.context().keys(...args),
          get global() {
            return node.context().global;
          },
          get flow() {
            return node.context().flow;
          },
        },
        flow: {
          set: (...args) => {
            node.context().flow.set(...args);
          },
          get: (...args) => node.context().flow.get(...args),
          keys: (...args) => node.context().flow.keys(...args),
        },
        global: {
          set: (...args) => {
            node.context().global.set(...args);
          },
          get: (...args) => node.context().global.get(...args),
          keys: (...args) => node.context().global.keys(...args),
        },
        env: {
          get: (envVar) => {
            const flow = node._flow;
            return flow.getSetting(envVar);
          },
        },
        setTimeout: (...args) => {
          const func = args[0];
          let timerId;
          args[0] = () => {
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
        clearTimeout: (id) => {
          clearTimeout(id);
          const index = node.outstandingTimers.indexOf(id);
          if (index > -1) {
            node.outstandingTimers.splice(index, 1);
          }
        },
        setInterval: (...args) => {
          const func = args[0];
          args[0] = () => {
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
        clearInterval: (id) => {
          clearInterval(id);
          const index = node.outstandingIntervals.indexOf(id);
          if (index > -1) {
            node.outstandingIntervals.splice(index, 1);
          }
        },
      };

      if (Object.prototype.hasOwnProperty.call(util, 'promisify')) {
        sandbox.setTimeout[util.promisify.custom] = (after, value) => new Promise((resolve) => {
          sandbox.setTimeout(() => { resolve(value); }, after);
        });
        sandbox.promisify = util.promisify;
      }

      if (node.hasOwnProperty("libs")) {
        let moduleErrors = false;
        var modules = node.libs;
        modules.forEach(module => {
          var vname = module.hasOwnProperty("var") ? module.var : null;
          if (vname && (vname !== "")) {
            if (sandbox.hasOwnProperty(vname) || vname === 'node') {
              node.error(RED._("function.error.moduleNameError", { name: vname }))
              moduleErrors = true;
              return;
            }
            sandbox[vname] = null;
            try {
              var spec = module.module;
              if (spec && (spec !== "")) {
                var lib = RED.require(module.module);
                sandbox[vname] = lib;
              }
            } catch (e) {
              node.error(RED._("function.error.moduleLoadError", { module: module.spec, error: e.toString() }))
              moduleErrors = true;
            }
          }
        });
        if (moduleErrors) {
          throw new Error(RED._("function.error.externalModuleLoadError"));
        }
      }

      const funcText = `var results = null;
        results = (async function(){
          var node = {
          id: __node__.id,
          name: __node__.name,
          outputCount: __node__.outputCount,
          log: __node__.log,
          error: __node__.error,
          warn: __node__.warn,
          debug: __node__.debug,
          trace: __node__.trace,
          on: __node__.on,
          status: __node__.status,
          send: (msgs, cloneMsg) => { 
            __node__.send(
              RED.util.generateId(),
              msgs,
              cloneMsg
            );
          },
        };\n
        ${node.func}\n
        })();`;
      const context = vm.createContext(sandbox);
      node.script = vm.createScript(funcText, createVMOpt(node, ''));

      node.repeaterSetup = () => {
        if (this.repeat && !Number.isNaN(this.repeat) && this.interval_id === null) {
          this.interval_id = setInterval(() => {
            node.script.runInContext(context);
            context.results.then(function (results) {
              var newMsg = {};
              newMsg.payload = results;
              node.send(newMsg);
              node.emit('input', newMsg);
            }).catch(err => {
              if ((typeof err === "object") && err.hasOwnProperty("stack")) {
                var index = err.stack.search(/\n\s*at ContextifyScript.Script.runInContext/);
                err.stack = err.stack.slice(0, index).split('\n').slice(0, -1).join('\n');
                var stack = err.stack.split(/\r?\n/);
                var line = 0;
                var errorMessage;
                if (stack.length > 0) {
                  while (line < stack.length && stack[line].indexOf("ReferenceError") !== 0) {
                    line++;
                  }
                  if (line < stack.length) {
                    errorMessage = stack[line];
                    var m = /:(\d+):(\d+)$/.exec(stack[line + 1]);
                    if (m) {
                      var lineno = Number(m[1]) - 1;
                      var cha = m[2];
                      errorMessage += " (line " + lineno + ", col " + cha + ")";
                    }
                  }
                }
                if (!errorMessage) {
                  errorMessage = err.toString();
                }
                node.error(errorMessage);
              } else if (typeof err === "string") {
                node.error(err);
              } else {
                node.error(JSON.stringify(err));
              }
            });
          }, this.repeat);
          node.outstandingIntervals.push(this.interval_id);
        }
      };

      node.cancelRepeater = () => {
        clearInterval(this.interval_id);
        this.interval_id = null;
      };

      if (config.storestate) {
        config.initOpt = node.context().get('state');
        if (config.initOpt === undefined) { config.initOpt = config.options[0]; } 
        if (config.initOpt.valueType === 'func') { node.repeaterSetup(); }
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
        emitOnlyNewValues: config.unique,
        forwardInputMessages: false,
        storeFrontEndInputAsState: true,
        beforeSend(msg, orig) {
          if (config.storestate) { node.context().set('state', orig.msg.option); }
          if (orig && orig.msg.option.valueType === 'func') {
            node.repeaterSetup();
            orig._dontSend = true;
          } else {
            node.cancelRepeater();
            newMsg = {};
          }
          msg.payload = orig.msg.payload;
          return msg;
        },
        initController: ($scope) => {
          $scope.flag = true;
          $scope.init = (config) => {
            $scope.config = config;
            $scope.containerDiv = $(`#uiOutputContainer_${config.id}`)[0];
            $scope.sliderDivElement = $(`#uiOutputSlider_${config.id}`)[0];
            $scope.sliderWrapperElement = $(`#uiOutputSliderWrapper_${config.id}`)[0];
            const toggleRadioDiv = $scope.containerDiv.firstElementChild;
            config.options.forEach((option, index) => {
              const divElement = document.createElement('div');
              divElement.setAttribute('class', `ui-output-button ui-output-button-${config.id}`);
              divElement.setAttribute('id', `uiobtn_${config.id}_${index}`);
              divElement.innerHTML = option.label;
              divElement.addEventListener('click', () => {
                switchStateChanged(option.value, true);
              });
              toggleRadioDiv.appendChild(divElement);
            });
            switchStateChanged(config.initOpt.value, false);
          };

          const txtClassToStandOut = (bgColor, light, dark) => {
            const color = (bgColor.charAt(0) === '#') ? bgColor.substring(1, 7) : bgColor;
            const r = parseInt(color.substring(0, 2), 16);
            const g = parseInt(color.substring(2, 4), 16);
            const b = parseInt(color.substring(4, 6), 16);
            const uicolors = [r / 255, g / 255, b / 255];
            const c = uicolors.map((col) => {
              if (col <= 0.03928) {
                return col / 12.92;
              }
              return Math.pow((col + 0.055) / 1.055, 2.4);
            });
            const L = (0.2126 * c[0]) + (0.7152 * c[1]) + (0.0722 * c[2]);
            if ($scope.config.dark) {
              return (L > 0.35) ? dark : light;
            }
            return (L > 0.35) ? light : dark;
          };

          const switchStateChanged = (newValue, sendMsg) => {
            let divIndex = -1;
            const newMsg = {};
            $scope.config.options.forEach((option, index) => {
              if ($(`#uiobtn_${$scope.config.id}_${index}`).length) {
                $(`#uiobtn_${$scope.config.id}_${index}`).css({ cursor: 'pointer', 'pointer-events': 'auto' });
                $(`#uiobtn_${$scope.config.id}_${index}`).removeClass('light dark');
                if (option.value === newValue) {
                  $(`#uiobtn_${$scope.config.id}_${index}`).css({ cursor: 'default', 'pointer-events': 'none' });
                  const color = $scope.config.useThemeColors ? $scope.config.widgetColor : option.color ? option.color : $scope.config.widgetColor;
                  $(`#uiobtn_${$scope.config.id}_${index}`).addClass(txtClassToStandOut(color, 'light', 'dark'));
                  divIndex = index;
                }
              }
            });
            if (divIndex >= 0) {
              let percentage = '0%';
              newMsg.option = $scope.config.options[divIndex];
              $scope.inputState = $scope.config.options[divIndex].label;
              if ($scope.config.options.length > 0 && divIndex >= 0) {
                percentage = (100 / $scope.config.options.length) * divIndex;
                $scope.sliderDivElement.style.left = `${percentage}%`;
                if ($scope.config.useThemeColors !== true) {
                  $scope.sliderDivElement.style.backgroundColor = $scope.config.options[divIndex].color;
                }
              }
              if ($scope.config.options[divIndex].valueType === 'str') {
                newMsg.payload = newValue;
              }
              if ($scope.config.options[divIndex].valueType === 'num') {
                newValue = Number(newValue);
                newMsg.payload = newValue;
              }
              if ($scope.config.options[divIndex].valueType === 'bool') {
                if (newValue === 'true') {
                  newValue = true;
                } else {
                  newValue = false;
                }
                newMsg.payload = newValue;
              }
              if ($scope.config.options[divIndex].valueType === 'func') {
                newMsg.payload = null;
              }
              if (sendMsg) {
                $scope.send(newMsg);
              }
            } else {
              console.log(`No radio button has value '${newValue}'`);
            }
          };
          
          $scope.$watch('msg', (msg) => {
            console.log(msg);
            if (msg.hasOwnProperty('_toFront') && msg._toFront === true) {
              let divIndex = -1;
              $scope.config.options.forEach((option, index) => {
                if (option.value === msg.payload) {
                  divIndex = index;
                }
              });
              if (divIndex >= 0) {
                $scope.inputState = $scope.config.options[divIndex].label.toString();
              } else {
                $scope.inputState = msg.payload.toString();
              }
            }
          });
        },
      });

      node.on('input', (msg) => {
        if (typeof msg.topic === 'string' && msg.topic !== '') {
          this.context().set(msg.topic, msg.payload);
        }
      });

      node.on('close', () => {
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
      updateErrorInfo(e);
      node.error(e);
    }
  }
  RED.nodes.registerType('ui_output', OutletNode, {
    dynamicModuleList: "libs",
  });
  RED.library.register('functions');

  const uipath = RED.settings.ui.path || 'ui';
  const fullPath = path.join(RED.settings.httpNodeRoot, uipath, '/ui-reef/*').replace(/\\/g, '/');

  RED.httpNode.get(fullPath, function (req, res) {
    var options = {
      root: __dirname + '/lib/',
      dotfiles: 'deny'
    };
    res.sendFile(req.params[0], options)
  });
};
