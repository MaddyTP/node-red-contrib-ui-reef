 module.exports = (RED) => {
    const path = require('path');
    function checkConfig(node, conf) {
        if (!conf || !conf.hasOwnProperty('group')) {
            node.error(RED._('table.error.no-group'));
            return false;
        }
        else {
            return true;
        }
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
        this.scale = config.scale;
        this.minin = Number(config.minin);
        this.minout = Number(config.minout);
        this.maxin = Number(config.maxin);
        this.maxout = Number(config.maxout);
        const node = this;
        var oldMsg = {};
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
                const done = ui.addWidget({
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
                    convertBack: function(data) {
                        if (data) {
                            return parseFloat(data.value);
                        }
                    },
                    convert: (value, oldValue, msg) => {
                        oldMsg = msg;
                        if (!oldValue) {
                            oldValue = { plot: [], value: 0 };
                        }
                        var time = 0;
                        if (msg.timestamp !== undefined) { 
                            time = new Date(msg.timestamp).getTime(); 
                        } else { 
                            time = new Date().getTime();
                        }
                        var limitOffsetSec = parseInt(config.removeOlder) * parseInt(config.removeOlderUnit);
                        var limitTime = time - (limitOffsetSec * 1000);
                        if (Array.isArray(value)) {
                            var flag = false;
                            if (value.length === 0) {
                                value = [];
                            } else if (value[0].hasOwnProperty("x") && value[0].hasOwnProperty("y")) {
                                for (var dd = 0; dd < value.length; dd++) {
                                    if (isNaN(value[dd].x) || isNaN(value[dd].y)) { flag = true; }
                                }
                            } else {
                                flag = true;
                            }
                            if (flag) {
                                node.warn("Bad data inject");
                                return;
                            }
                            oldValue.plot = value;
                        } else {
                            if (Number.isNaN(value) || value === null) {
                                node.warn("Bad data inject");
                                return;
                            }
                            var n = Number(value);
                            if (node.scale) {
                                if (n < node.minin) { n = node.minin; }
                                if (n > node.maxin) { n = node.maxin; }
                                n = ((n - node.minin) / (node.maxin - node.minin) * (node.maxout - node.minout)) + node.minout;
                            }
                            value = n.toFixed(node.decimal);
                            if (time >= limitTime) {
                                var point = { "x":time, "y":value };
                                oldValue.plot.push(point);
                            }
                        }
                        var tmp = [];
                        var latestValue = 0;
                        for (var u = 0; u < oldValue.plot.length; u++) {
                            if (oldValue.plot[u][0] >= limitTime || oldValue.plot[u].x >= limitTime) { 
                                tmp.push( oldValue.plot[u] );
                            }
                            if (oldValue.plot[u][0] > latestValue || oldValue.plot[u].x >= latestValue) { 
                                latestValue = oldValue.plot[u].y;
                            }
                        }
                        oldValue.plot = tmp;
                        oldValue.value = latestValue;
                        value = oldValue;
                        return value;
                    },
                    beforeEmit: (msg, value) => {
                        return { msg: {
                            payload: value,
                            socketid: msg.socketid
                        }};
                    },
                    initController: ($scope) => {
                        $scope.flag = true;
                        $scope.jsChart;
                        $scope.init = (config) => {
                            $scope.config = config;
                            $scope.latestValue = '0';
                            var chartBack = $scope.config.widgetColor + '1a';
                            var ctx = $(`#uiProbeChart_${$scope.config.id}`);
                            ctx.css('background-color', chartBack);
                            $scope.jsChart = new Chart(ctx, {
                                type: 'line',
                                data: {
                                    datasets: [{
                                        borderColor: $scope.config.widgetColor,
                                        borderWidth: 2,
                                        data: [],
                                        fill: false,
                                        tension: 0.4,
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
                                        }
                                    }
                                },
                            });
                        };

                        $scope.$watch('msg.payload', (newValue) => {
                            if (newValue) {
                                $scope.latestValue = newValue.value;
                                $scope.jsChart.data.datasets[0].data = newValue.plot;
                                $scope.jsChart.update();
                            }
                        });
                    },
                });

                node.on('close', () => {
                    done();
                });
            }
        } catch (e) {
            node.error(e);
        }
    }
    RED.nodes.registerType('ui_probe', ProbeNode);

    const uipath = RED.settings.ui.path || 'ui';
    const libPath = path.join(RED.settings.httpNodeRoot, uipath, '/lib/*').replace(/\\/g, '/');
    const depPath = path.join(RED.settings.httpNodeRoot, uipath, '/dep/*').replace(/\\/g, '/');

    RED.httpNode.get(libPath, function (req, res) {
        var options = {
            root: __dirname + '/lib/',
            dotfiles: 'deny'
        };
        res.sendFile(req.params[0], options)
    });

    RED.httpNode.get(depPath, function (req, res) {
        var options = {
            root: __dirname + '/node_modules/',
            dotfiles: 'deny'
        };
        res.sendFile(req.params[0], options)
    });
};
