const path = require('path');
module.exports = function (RED) {
  function checkConfig(node, conf) {
    if (!conf || !conf.hasOwnProperty('group')) {
      node.error(RED._('table.error.no-group'));
      return false;
    }
    return true;
  }
  function HTML(config) {
    config.id = config.id.replace('.', '_');
    const configAsJson = JSON.stringify(config);
    const html = String.raw`
        <link href='lib/css/uireef.css' rel='stylesheet' type='text/css'>
        <script type='text/javascript' src='dep/chart.js/dist/chart.js'></script>
        <script type='text/javascript' src='dep/moment/moment.js'></script>
        <script type='text/javascript' src='dep/chartjs-adapter-moment/dist/chartjs-adapter-moment.js'></script>
        <div class="probe-container" ng-init='init(${configAsJson})'>
            <div class="probe-chart">
                <canvas id="uiProbeChart_${config.id}" class="probe-chart-canvas"></canvas>
            </div>
            <div class="probe-label">
                <div class="probe-name">${config.label}</div>
                <div class="probe-value">{{latestValue}}</div>
            </div>
        </div>
       `;
    return html;
  }
  let ui;
  function ProbeNode(config) {
    this.decimal = Number(config.decimal);
    this.symbol = config.symbol;
    this.scale = config.scale;
    this.minin = Number(config.minin);
    this.minout = Number(config.minout);
    this.maxin = Number(config.maxin);
    this.maxout = Number(config.maxout);
    const node = this;
    try {
      if (checkConfig(node, config)) {
        if (ui === undefined) {
          ui = RED.require('node-red-dashboard')(RED);
        }
        config.dark = false;
        if (typeof ui.isDark === 'function') {
          config.dark = ui.isDark();
          config.widgetColor = ui.getTheme()['widget-backgroundColor'].value;
        }
        RED.nodes.createNode(this, config);
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
          forwardInputMessages: true,
          storeFrontEndInputAsState: true,
          convertBack: function (data) {
            return parseFloat(data.value);
          },
          convert: function (value, oldValue, msg) {
            if (!oldValue) {
              oldValue = { plot: [], value: 0 };
            }
            let time = 0;
            if (msg.timestamp !== undefined) {
              time = new Date(msg.timestamp).getTime();
            } else {
              time = new Date().getTime();
            }
            const limitOffsetSec = parseInt(config.removeOlder, 10) * parseInt(config.removeOlderUnit, 10);
            const limitTime = time - (limitOffsetSec * 1000);
            if (Array.isArray(value)) {
              let flag = false;
              if (value.length === 0) {
                value = [];
              }
              if (value[0].hasOwnProperty('x') && value[0].hasOwnProperty('y')) {
                for (let dd = 0; dd < value.length; dd += 1) {
                  if (Number.isNaN(value[dd].y)) {
                    flag = true;
                  } else {
                    let n = Number(value[dd].y);
                    if (node.scale) {
                      if (n < node.minin) { n = node.minin; }
                      if (n > node.maxin) { n = node.maxin; }
                      n = (((n - node.minin) / (node.maxin - node.minin)) * (node.maxout - node.minout)) + node.minout;
                    }
                    value[dd].y = n.toFixed(node.decimal);
                  }
                }
              } else {
                flag = true;
              }
              if (flag) {
                node.warn('Bad data inject');
                return;
              }
              oldValue.plot = value;
            } else {
              if (Number.isNaN(value) || value === null) {
                node.warn('Bad data inject');
                return;
              }
              let n = Number(value);
              if (node.scale) {
                if (n < node.minin) { n = node.minin; }
                if (n > node.maxin) { n = node.maxin; }
                n = (((n - node.minin) / (node.maxin - node.minin)) * (node.maxout - node.minout)) + node.minout;
              }
              value = n.toFixed(node.decimal);
              if (time >= limitTime) {
                const point = { x: time, y: value };
                oldValue.plot.push(point);
              }
            }
            const tmp = [];
            let latestValue = 0;
            for (let u = 0; u < oldValue.plot.length; u += 1) {
              if (oldValue.plot[u][0] >= limitTime || oldValue.plot[u].x >= limitTime) {
                tmp.push(oldValue.plot[u]);
              }
              if (oldValue.plot[u][0] > latestValue || oldValue.plot[u].x >= latestValue) {
                latestValue = oldValue.plot[u].y;
              }
            }
            oldValue.plot = tmp;
            oldValue.value = latestValue + node.symbol;
            value = oldValue;
            return value;
          },
          beforeEmit: function (msg, value) {
            return {
              msg: {
                payload: value,
                socketid: msg.socketid,
              },
            };
          },
          initController: function ($scope) {
            $scope.flag = true;
            $scope.jsChart;
            $scope.init = function (config) {
              $scope.config = config;
              $scope.latestValue = '0';
              const ctx = $(`#uiProbeChart_${$scope.config.id}`);
              ctx.css('background-color', $scope.config.widgetColor + '1a');
              $scope.jsChart = new Chart(ctx, {
                type: 'line',
                data: {
                  datasets: [{
                    borderColor: $scope.config.widgetColor,
                    borderWidth: 2,
                    data: [],
                    fill: false,
                    tension: 0.2,
                    pointRadius: 0,
                  }],
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: {
                    duration: 0,
                    easing: 'linear',
                  },
                  layout: {
                    padding: 10,
                  },
                  plugins: {
                    legend: {
                      display: false,
                    },
                    title: {
                      display: false,
                    },
                  },
                  interaction: {
                    intersect: false,
                  },
                  scales: {
                    x: {
                      display: false,
                      type: 'time',
                    },
                    y: {
                      display: false,
                    },
                  },
                },
              });
            };
            $scope.$watch('msg.payload', function (newValue) {
              if (newValue) {
                $scope.latestValue = newValue.value;
                $scope.jsChart.data.datasets[0].data = newValue.plot;
                $scope.jsChart.update();
              }
            });
          },
        });
        node.on('close', function () {
          ui_done();
        });
      }
    } catch (e) {
      node.error(e);
    }
  }
  RED.nodes.registerType('ui_probe', ProbeNode);
  const uipath = ((RED.settings.ui || {}).path) || 'ui';
  const libPath = path.join(RED.settings.httpNodeRoot, uipath, '/lib/*').replace(/\\/g, '/');
  const depPath = path.join(RED.settings.httpNodeRoot, uipath, '/dep/*').replace(/\\/g, '/');
  RED.httpNode.get(libPath, function (req, res) {
    const options = {
      root: `${__dirname}/lib/`,
      dotfiles: 'deny',
    };
    res.sendFile(req.params[0], options);
  });
  RED.httpNode.get(depPath, function (req, res) {
    const options = {
      root: `${__dirname}/node_modules/`,
      dotfiles: 'deny',
    };
    res.sendFile(req.params[0], options);
  });
};