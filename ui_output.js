/* eslint-disable import/no-dynamic-require */
/**
 * Copyright 2021 Bart Butenaers & hotNipi
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * */
const util = require('util');
const vm = require('vm');

module.exports = (RED) => {
  function HTML(config) {
    delete config.func;
    config.id = config.id.replace('.', '_');
    const configAsJson = JSON.stringify(config);
    const html = String.raw`
      <style>
          .ui-output-container{
              display: block;
              width:100%;
              margin:auto;
              padding: 3px;
          }
          .ui-output-header{
              display: flex;
                justify-content: space-between;
              font-size: 14px;
              font-weight: 500;
              letter-spacing: .1em;
              text-transform: uppercase;
              margin: 0.1em;
              padding-left: 2px;
              padding-right: 2px;
          }
          .ui-output-config{
              color: #999;
              cursor: pointer;
          }
          .ui-output-wrapper.disabled{
              border-color:gray;
              border-style:dashed;
          }
          .ui-output-wrapper{
              border:1px solid var(--nr-dashboard-widgetColor);
              display: flex;
              flex-flow: column nowrap;
              justify-content: center;
              align-items: center;
              position:relative;
              font-size: 14px;
              font-weight: 425;
              letter-spacing: .06em;
              text-transform: uppercase;
              margin: auto 0;
              width:100%;
              height: 1.55em;
          }
          .ui-output-slider-wrapper.disabled{
              opacity:0.5;
          }
          .ui-output-slider-wrapper{
              height: 1em;
              padding-top: 0.25em;
              padding-bottom: 0.25em;
              z-index:0
          }
          .ui-output-body.disabled{
              color:gray;
              pointer-events:none; 
          }
          .ui-output-body{
              pointer-events:auto;
              display: inline-flex;
              justify-content: flex-start;
              width: 100%;
          }
          .ui-output-slider-${config.id}{
              width: calc((100% - (${config.options.length} * 0.2em)) / ${config.options.length});
          }
          .ui-output-slider{                
              background-color: var(--nr-dashboard-widgetColor);
              position: absolute;
              height: 1.2em;
              transform: translate(0.1em, -0.25em);
              transition: all .4s ease;
              left: 0%;
              z-index:0;
          }
          .ui-output-button-${config.id}{
              width:calc(100% / ${config.options.length}); 
          }
          .ui-output-button.disabled{
              pointer-events:none !important;
          }
          .ui-output-button.dark{
              color:var(--nr-dashboard-widgetBgndColor);
          }
          .ui-output-button.light{
              color:var(--nr-dashboard-widgetTextColor);
          }
          .ui-output-button{
             text-align:center;
             z-index:1;
             outline: none;
             user-select:none;
             cursor:pointer;
             line-height: 1.2em;
             transition: color 0.5s ease;
          }
          .ui-output-round{
              border-radius: 0.8em;
          }
          .ui-output-input{
             color: var(--nr-dashboard-widgetColor);
          }
      </style>
      <div class="ui-output-container" ng-init='init(${configAsJson})'>
          <div ng-if="${config.label !== ''}" class="ui-output-header">
              <div>${config.label}</div>
              <div>
                  <span class="ui-output-input">{{inputState}}</span>
                  <i class="fa fa-cog ui-output-config"></i>
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

  function createVMOpt(node, kind) {
    const opt = {
      filename: `Function node${kind}:${node.id}${node.name ? ` [${node.name}]` : ''}`,
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
        if (/setup/.exec(m[1])) {
          kind = 'setup:';
        }
        if (/cleanup/.exec(m[1])) {
          kind = 'cleanup:';
        }
        err.message += ` (${kind}line ${line})`;
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
    node.libs = config.libs || [];
    node.outstandingTimers = [];
    node.outstandingIntervals = [];
    node.clearStatus = false;

    if (RED.settings.functionExternalModules !== true && node.libs.length > 0) {
      throw new Error(RED._("function.error.externalModuleNotAllowed"));
    }

    var handleNodeDoneCall = true;

    if (/node\.done\s*\(\s*\)/.test(node.func)) {
      handleNodeDoneCall = false;
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
              //TODO: NLS error message
              node.error(RED._("function.error.moduleLoadError", { module: module.spec, error: e.toString() }))
              moduleErrors = true;
            }
          }
        });
        if (moduleErrors) {
          throw new Error(RED._("function.error.externalModuleLoadError"));
        }
      }

      const funcText = `
                    (function() {
                        var node = {
                            id:__node__.id,
                            name:__node__.name,
                            log:__node__.log,
                            error:__node__.error,
                            warn:__node__.warn,
                            debug:__node__.debug,
                            trace:__node__.trace,
                            status:__node__.status,
                        };\n
                        ${node.func}\n
                    })(__funcSend__);`;

      const context = vm.createContext(sandbox);
      let funcOpt;
      let funcScript;

      if (node.func && node.func !== '') {
        funcOpt = createVMOpt(node, '');
        funcScript = new vm.Script(funcText, funcOpt);
        context.__funcSend__ = () => { };
      }

      node.repeaterSetup = (stateField) => {
        if (this.repeat && !Number.isNaN(this.repeat) && this.repeat > 0 && funcScript !== '' && this.interval_id === null) {
          this.interval_id = setInterval(() => {
            const newMsg = {};
            const newValue = funcScript.runInContext(context, funcOpt);
            RED.util.setMessageProperty(newMsg, stateField, newValue, true);
            node.send(newMsg);
            node.emit('input', newMsg);
          }, this.repeat);
          node.outstandingIntervals.push(this.interval_id);
        }
      };

      node.cancelRepeater = () => {
        clearInterval(this.interval_id);
        this.interval_id = null;
      };

      config.initOpt = node.context().get('state');
      if (config.initOpt === undefined) {
        config.initOpt = config.options[0];
      }

      if (config.initOpt.valueType === 'func' && node.func && node.func !== '') {
        node.repeaterSetup(config.stateField);
      }

      const html = HTML(config);
      const done = ui.addWidget({
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
        convertBack(value) {
          return value;
        },
        beforeEmit(msg) {
          if (msg) {
            const newMsg = {};
            newMsg.socketid = msg.socketid;
            newMsg.state = RED.util.getMessageProperty(msg, config.stateField || 'payload');
            return { msg: newMsg };
          }
          return msg;
        },
        beforeSend(msg, orig) {
          if (orig) {
            const newMsg = {};
            let newValue = null;
            if (orig.msg.option.valueType === 'func') {
              if (node.func && node.func !== '') {
                newValue = funcScript.runInContext(context, funcOpt);
                RED.util.setMessageProperty(newMsg, config.stateField, newValue, true);
                node.repeaterSetup(config.stateField);
              }
            } else {
              node.cancelRepeater();
              newValue = orig.msg.state;
              RED.util.setMessageProperty(newMsg, config.stateField, newValue, true);
            }
            if (config.storestate) {
              node.context().set('state', orig.msg.option);
            }
            return newMsg;
          }
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

          $scope.$watch('msg', (msg) => {
            if (!msg) {
              return;
            }
            if (msg.state !== undefined) {
              $scope.inputState = msg.state.toString();
            }
          });

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
              if ($scope.config.options.length > 0 && divIndex >= 0) {
                percentage = (100 / $scope.config.options.length) * divIndex;
                $scope.sliderDivElement.style.left = `${percentage}%`;
                if ($scope.config.useThemeColors !== true) {
                  $scope.sliderDivElement.style.backgroundColor = $scope.config.options[divIndex].color;
                }
              }
              if ($scope.config.options[divIndex].valueType === 'str') {
                newMsg.state = newValue;
              }
              if ($scope.config.options[divIndex].valueType === 'num') {
                newValue = Number(newValue);
                newMsg.state = newValue;
              }
              if ($scope.config.options[divIndex].valueType === 'bool') {
                if (newValue === 'true') {
                  newValue = true;
                } else {
                  newValue = false;
                }
                newMsg.state = newValue;
              }
              if ($scope.config.options[divIndex].valueType === 'func') {
                newMsg.state = newValue;
              }
              if (sendMsg) {
                $scope.send(newMsg);
                $scope.emit(newMsg);
              }
            } else {
              console.log(`No radio button has value '${newValue}'`);
            }
          };
        },
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
        done();
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
};
