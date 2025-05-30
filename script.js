console.log("Script start");
console.log("D3:", typeof d3 !== "undefined" ? d3.version : "Not loaded");

let nodes = [];
let flows = [];
let connections = [];
let staticInfo = [];

const svg = d3.select("#visualization");
console.log("SVG element:", svg.empty() ? "Not found" : "Found");
if (svg.empty()) {
    console.error("SVG element with id='visualization' not found");
    alert("Error: SVG element not found. Ensure index.html has <svg id='visualization'>.");
    throw new Error("SVG element not found");
}

const width = +svg.attr("width") || 1400;
const height = window.innerHeight * 0.9;
svg.attr("height", height);
console.log("SVG dimensions:", width, height);

// Define gradients and shadows
const defs = svg.append("defs");

// Gradient for info boxes
const infoGradient = defs.append("linearGradient")
    .attr("id", "info-gradient")
    .attr("x1", "0%")
    .attr("y1", "0%")
    .attr("x2", "0%")
    .attr("y2", "100%");
infoGradient.append("stop")
    .attr("offset", "0%")
    .attr("style", "stop-color:#2E3B3E;stop-opacity:1");
infoGradient.append("stop")
    .attr("offset", "100%")
    .attr("style", "stop-color:#1A2526;stop-opacity:1");

// Drop shadow filter
const filter = defs.append("filter")
    .attr("id", "drop-shadow")
    .attr("height", "130%");
filter.append("feGaussianBlur")
    .attr("in", "SourceAlpha")
    .attr("stdDeviation", 3);
filter.append("feOffset")
    .attr("dx", 2)
    .attr("dy", 2)
    .attr("result", "offsetblur");
filter.append("feComponentTransfer")
    .append("feFuncA")
    .attr("type", "linear")
    .attr("slope", 0.5);
const feMerge = filter.append("feMerge");
feMerge.append("feMergeNode");
feMerge.append("feMergeNode")
    .attr("in", "SourceGraphic");

const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);
console.log("Tooltip created");

async function loadData() {
    console.log("Loading infrastructure.json");
    try {
        const response = await fetch("infrastructure.json?_=" + new Date().getTime());
        console.log("Fetch response status:", response.status, response.statusText);
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Fetch failed. Response content:", errorText);
            throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}. Response: ${errorText}`);
        }

        const responseText = await response.text();
        console.log("Raw response content:", responseText);

        let jsonData;
        try {
            jsonData = JSON.parse(responseText);
        } catch (parseError) {
            console.error("JSON parsing failed:", parseError);
            console.error("Response content that failed to parse:", responseText);
            throw new Error(`Failed to parse JSON: ${parseError.message}. Response: ${responseText}`);
        }

        console.log("JSON loaded:", jsonData ? "Success" : "Empty", jsonData);
        if (!jsonData || !jsonData.apps || !jsonData.blueprint) {
            console.error("Invalid JSON structure: missing apps or blueprint", jsonData);
            alert("Error: Invalid infrastructure.json structure. Check console for details.");
            throw new Error("Invalid JSON structure");
        }

        nodes = jsonData.apps.map(d => ({
            ...d.api,
            name: d.name,
            x: d.api.position.x,
            y: d.api.position.y,
            crashed: false,
            hovered: false
        }));

        const flowColors = ["#4A90E2", "#E57373", "#81C784", "#FFCA28"];
        flows = Object.keys(jsonData.blueprint.flows).flatMap((key, index) =>
            jsonData.blueprint.flows[key].map(flow => ({
                id: key,
                name: flow.name,
                type: flow.type,
                color: flow.color || flowColors[index % flowColors.length],
                conditions: flow.conditions || [{
                    id: "default",
                    name: "Default",
                    path: flow.path,
                    labels: flow.labels || flow.path.map((_, i) => ({text: `#${i + 1}`, color: "#E8ECEF"})),
                    decisions: flow.decisions || [],
                    pause: flow.pause || 2000,
                    color: flow.color || flowColors[index % flowColors.length]
                }]
            }))
        );

        const desiredOrder = [
            "onboarding",
            "policy_onboarding",
            "inbound_traffic",
            "openapi_flow",
            "internal_traffic",
            "rapid_auth"
        ];

        flows.sort((a, b) => {
            const indexA = desiredOrder.indexOf(a.id);
            const indexB = desiredOrder.indexOf(b.id);
            return indexA - indexB;
        });

        connections = jsonData.connections || [];
        staticInfo = jsonData.blueprint.static_info || [];
        console.log("Nodes:", nodes.length, nodes);
        console.log("Flows:", flows.length, flows);
        console.log("Connections:", connections.length);
        console.log("Static Info:", staticInfo.length);
    } catch (error) {
        console.error("Error loading JSON:", error);
        alert("Error loading infrastructure.json: " + error.message + ". Check console and ensure file exists.");
        svg.append("g")
            .attr("class", "error-message")
            .append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#EF5350")
            .attr("font-size", "16px")
            .text("Error loading infrastructure.json: " + error.message);
        throw error;
    }
}

function initBlueprint() {
    console.log("Initializing persistent blueprint");
    try {
        svg.selectAll(".blueprint").remove();
        if (!nodes.length) {
            console.error("No valid nodes to render");
            alert("Error: No apps defined in infrastructure.json.");
            svg.append("g")
                .attr("class", "error-message")
                .append("text")
                .attr("x", width / 2)
                .attr("y", height / 2)
                .attr("text-anchor", "middle")
                .attr("fill", "#EF5350")
                .attr("font-size", "16px")
                .text("Error: No apps defined in infrastructure.json.");
            return;
        }

        const nodeGroup = svg.append("g")
            .attr("class", "blueprint");

        const node = nodeGroup.selectAll(".node")
            .data(nodes)
            .enter().append("g")
            .attr("class", "node")
            .attr("transform", d => {
                console.log(`Node ${d.name} positioned at x:${d.x}, y:${d.y}`);
                return `translate(${d.x}, ${d.y})`;
            });

        console.log("Node count:", node.size());
        if (node.size() !== nodes.length) {
            console.error("Node rendering mismatch. Expected:", nodes.length, "Rendered:", node.size());
            alert("Error: Failed to render all nodes. Check console.");
        }

        node.each(function(d) {
            const g = d3.select(this);
            let shape;
            if (d.shape === "cylinder") {
                shape = g.append("path")
                    .attr("d", `M${-d.size / 2},${-d.size} A${d.size / 2},${d.size / 4} 0 0,1 ${d.size / 2},${-d.size} L${d.size / 2},${d.size} A${d.size / 2},${d.size / 4} 0 0,1 ${-d.size / 2},${d.size} Z`)
                    .attr("fill", "none")
                    .attr("stroke", d.color)
                    .attr("stroke-width", 2);
            } else if (d.shape === "square") {
                shape = g.append("rect")
                    .attr("x", -d.size / 2)
                    .attr("y", -d.size / 2)
                    .attr("width", d.size)
                    .attr("height", d.size)
                    .attr("fill", "none")
                    .attr("stroke", d.color)
                    .attr("stroke-width", 2);
            } else {
                console.warn("Unknown shape for:", d.name, d.shape);
                return;
            }

            shape
                .style("cursor", "pointer")
                .on("mouseover", function(event) {
                    console.log("Hover over shape:", d.name);
                    tooltip.transition().duration(200).style("opacity", 0.9);
                    let html = `
                        <strong>Service:</strong> ${d.name}<br>
                        <strong>ID:</strong> ${d.id}<br>
                        <strong>Endpoint:</strong> ${d.endpoint}<br>
                        <strong>Method:</strong> ${d.method}<br>
                        <strong>Details:</strong> ${d.details}<br>
                        <strong>Certificates:</strong><br>
                          Keystore: ${d.certificates.keystore}<br>
                          Truststore: ${d.certificates.truststore}
                    `;
                    if (d.certificates.signing_cert) {
                        html += `<br>  Signing Cert: ${d.certificates.signing_cert}`;
                    }
                    if (d.certificates.signing_key) {
                        html += `<br>  Signing Key: ${d.certificates.signing_key}`;
                    }
                    if (d.certificates.signing_hsm) {
                        html += `<br>  Signing HSM: ${d.certificates.signing_hsm}`;
                    }
                    tooltip.html(html)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mouseout", function() {
                    console.log("Mouse out from shape:", d.name);
                    tooltip.transition().duration(500).style("opacity", 0);
                })
                .on("click", function() {
                    console.log("Clicked shape:", d.name);
                    const slug = d.name.toLowerCase().replace(/\s+/g, '-');
                    window.location.href = `details.html?app=${slug}`;
                });

            g.append("text")
                .attr("dx", d => -d.size / 2)
                .attr("dy", d => (d.shape === "cylinder" ? -d.size : -d.size / 2) - 10)
                .attr("text-anchor", "start")
                .attr("font-size", "14px")
                .attr("font-weight", "bold")
                .attr("fill", "#E8ECEF")
                .style("text-shadow", "1px 1px 2px rgba(0, 0, 0, 0.5)")
                .text(d => {
                    console.log(`Rendering label for node ${d.id}: ${d.name}`);
                    return d.name || "Unknown";
                });

            g.append("text")
                .attr("class", "crash-indicator")
                .attr("text-anchor", "middle")
                .attr("dy", ".35em")
                .attr("fill", "#EF5350")
                .style("font-size", d => `${d.size / 2}px`)
                .style("opacity", 0)
                .text("X");
        });

        console.log("Persistent blueprint initialized with", node.size(), "nodes");
    } catch (error) {
        console.error("Error in initBlueprint:", error);
        alert("Error initializing blueprint. Check console for details.");
    }
}

function renderStaticInfo() {
    console.log("Rendering static info box");
    try {
        svg.selectAll(".static-info").remove();
        const infoGroup = svg.append("g")
            .attr("class", "static-info")
            .attr("transform", "translate(970, 20)");

        const infoBox = infoGroup.append("rect")
            .attr("x", -10)
            .attr("y", -10)
            .attr("width", 410)
            .attr("height", staticInfo.length * 25 + 20)
            .attr("fill", "url(#info-gradient)")
            .attr("stroke", "#4A5A5D")
            .attr("stroke-width", 1)
            .attr("rx", 5)
            .style("filter", "url(#drop-shadow)");

        infoGroup.selectAll(".info-text")
            .data(staticInfo)
            .enter().append("text")
            .attr("class", "info-text")
            .attr("x", 5)
            .attr("y", (d, i) => i * 25 + 15)
            .attr("font-size", d => d.font_size || "13px")
            .attr("font-weight", d => d.font_weight || "normal")
            .attr("fill", d => d.color || "#E8ECEF")
            .text(d => d.text);
        console.log("Static info box rendered with", staticInfo.length, "lines");
    } catch (error) {
        console.error("Error in renderStaticInfo:", error);
        alert("Error rendering static info box. Check console for details.");
    }
}

async function renderBlueprint() {
    console.log("Rendering Infrastructure tab");
    try {
        await loadData();
        svg.selectAll(".overlay").remove();
        d3.selectAll(".tab").classed("active", false);
        d3.select("#layer-infrastructure").classed("active", true);
        initBlueprint();
        svg.selectAll(".node")
            .style("opacity", 1);
        console.log("Infrastructure tab rendered");
    } catch (error) {
        console.error("Error in renderBlueprint:", error);
        alert("Error rendering Infrastructure tab. Check console for details.");
    }
}

async function renderFlows(flowId, conditionId = "default") {
    console.log(`Rendering flow: ${flowId}, condition: ${conditionId}`);
    try {
        await loadData();
        const overlay = svg.select(".overlay");
        if (overlay.empty()) {
            svg.append("g").attr("class", "overlay");
        }

        d3.selectAll(".tab").classed("active", false);
        d3.select("#layer-flows").classed("active", true);

        const flow = flows.find(f => f.id === flowId);
        if (!flow) {
            console.error(`No valid flow for: ${flowId}`);
            alert(`Error: Flow ${flowId} not found.`);
            return;
        }

        const condition = flow.conditions.find(c => c.id === conditionId);
        if (!condition) {
            console.error(`No valid condition for: ${conditionId}`);
            alert(`Error: Condition ${conditionId} not found.`);
            return;
        }

        const path = condition.path;
        const labels = condition.labels || path.map((_, i) => ({text: `#${i + 1}`, color: "#E8ECEF"}));
        const color = condition.color || flow.color;
        const pause = condition.pause || 2000;
        const decisions = condition.decisions || [];
        console.log("Flow path:", path);
        console.log("Labels:", labels);
        console.log("Decisions:", decisions);

        if (path.length - 1 !== labels.length) {
            console.warn(`Label count (${labels.length}) does not match steps (${path.length - 1})`);
        }

        const pathNodeIds = new Set(path);
        svg.selectAll(".node")
            .style("opacity", d => pathNodeIds.has(d.id) ? 1 : 0);
        console.log(`Showing nodes in path: ${[...pathNodeIds].join(", ")}`);

        svg.append("defs").selectAll("marker")
            .data([color])
            .enter().append("marker")
            .attr("id", d => `arrow-${d.replace("#", "")}`)
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 10)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", d => d);

        const steps = path.slice(0, -1).map((sourceId, i) => {
            const source = nodes.find(n => n.id === sourceId);
            const target = nodes.find(n => n.id === path[i + 1]);
            if (!source || !target) {
                console.error(`Invalid step ${i + 1}: source=${sourceId}, target=${path[i + 1]}`, {source, target});
                return null;
            }
            return {
                source,
                target,
                label: labels[i] || {text: "", color: "#E8ECEF"},
                decision: decisions.find(d => d.step === i)
            };
        }).filter(step => step !== null);

        if (!steps.length) {
            console.error(`No valid steps for flow: ${flowId}, condition: ${conditionId}`, {path, nodes});
            alert(`Error: No valid steps defined for flow ${flowId}. Check console.`);
            return;
        }
        console.log("Steps:", steps);

        const links = steps.map((step, i) => ({
            source: step.source,
            target: step.target,
            label: step.label.text,
            labelColor: step.label.color || "#E8ECEF",
            fullLabel: step.label.text,
            decision: step.decision,
            yOffset: i % 2 === 0 ? 20 : 35
        }));
        console.log("Links for flow:", links.length, links);

        const totalDuration = links.length * 2000 + pause;
        console.log("Total duration:", totalDuration);

        const progressBar = d3.select("#progress-bar");
        progressBar.style("width", "0%");
        const startTime = Date.now();

        const updateProgress = () => {
            const elapsed = Date.now() - startTime;
            const progress = totalDuration ? Math.min(elapsed / totalDuration * 100, 100) : 0;
            progressBar.style("width", `${progress}%`)
                .style("box-shadow", `0 0 ${5 + progress / 20}px #4A90E2`);
            if (progress < 100 && totalDuration) requestAnimationFrame(updateProgress);
        };
        if (totalDuration) requestAnimationFrame(updateProgress);

        const authWebNode = svg.selectAll(".node")
            .filter(n => n.id === "API_AuthWeb");
        const persistentTextGroup = authWebNode.append("g")
            .attr("class", "persistent-success-text");

        const line = svg.select(".overlay").selectAll(".link")
            .data(links)
            .enter().append("g")
            .attr("class", "link");

        line.append("line")
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y)
            .attr("stroke", color)
            .attr("stroke-width", 2)
            .attr("marker-end", `url(#arrow-${color.replace("#", "")})`)
            .attr("class", "flowing-line")
            .style("stroke-dasharray", function() {
                const length = this.getTotalLength();
                return `${length} ${length}`;
            })
            .style("stroke-dashoffset", function() {
                return this.getTotalLength();
            })
            .style("opacity", 1);

        line.each(function(d, i) {
            const linkGroup = d3.select(this);
            const delay = i * 2000;
            console.log(`Rendering step ${i + 1}: ${d.source.name} → ${d.target.name}, label: ${d.fullLabel}, decision: ${d.decision ? d.decision.outcome : 'none'}`);

            const targetNode = svg.selectAll(".node")
                .filter(n => n.id === d.target.id);

            targetNode.select("rect, path")
                .transition()
                .delay(delay)
                .duration(500)
                .ease(d3.easeCubicInOut)
                .style("fill", "#66BB6A")
                .style("filter", "drop-shadow(0 0 5px #66BB6A)")
                .transition()
                .duration(500)
                .ease(d3.easeCubicInOut)
                .style("fill", "#66BB6A")
                .style("filter", "drop-shadow(0 0 10px #66BB6A)")
                .transition()
                .duration(500)
                .ease(d3.easeCubicInOut)
                .style("fill", "#66BB6A")
                .style("filter", "drop-shadow(0 0 5px #66BB6A)")
                .transition()
                .duration(500)
                .ease(d3.easeCubicInOut)
                .style("fill", "none")
                .style("filter", "none");

            console.log(`Target node: ${d.target.name}, ID: ${d.target.id}, x: ${d.target.x}, y: ${d.target.y}, size: ${d.target.size}`);

            if (d.source.id !== d.target.id) {
                linkGroup.select("line").transition()
                    .delay(delay)
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .style("stroke-dashoffset", 0)
                    .transition()
                    .duration(500)
                    .ease(d3.easeCubicInOut)
                    .style("opacity", 1);
            }

            const isInternalDecision = d.target.id === "API_AuthWeb" && (
                (conditionId === "no-cache" && [9, 12, 15].includes(i)) ||
                (conditionId === "cached" && [5, 6, 9].includes(i))
            );
            if (d.label && d.fullLabel.trim() !== "") {
                const labelX = isInternalDecision ? d.target.x : (d.source.x + d.target.x) / 2;
                const labelY = isInternalDecision ?
                    d.target.y - (d.target.size || 90) / 2 - 10 - (conditionId === "no-cache" ? (i === 12 ? 15 : i === 15 ? 30 : 0) : (i === 6 ? 15 : i === 9 ? 30 : 0)) :
                    (d.source.y + d.target.y) / 2 + d.yOffset;
                console.log(`Rendering flow label for step ${i + 1}: ${d.fullLabel}, x: ${labelX}, y: ${labelY}`);
                linkGroup.append("text")
                    .attr("x", labelX)
                    .attr("y", labelY)
                    .attr("text-anchor", "middle")
                    .attr("fill", d.labelColor)
                    .attr("font-size", isInternalDecision ? "11px" : "12px")
                    .attr("class", isInternalDecision ? "internal-decision" : "")
                    .text(d.fullLabel)
                    .style("opacity", 0)
                    .style("cursor", "pointer")
                    .on("mouseover", function(event) {
                        console.log("Hover over flow label:", d.fullLabel);
                        tooltip.transition().duration(200).style("opacity", 0.9);
                        tooltip.html(`
                            <strong>Label:</strong> ${d.fullLabel}<br>
                            <strong>Description:</strong> ${d.decision ? 'Decision: ' + d.decision.outcome : 'N/A'}
                        `)
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY - 28) + "px");
                    })
                    .on("mouseout", function() {
                        tooltip.transition().duration(500).style("opacity", 0);
                    })
                    .transition()
                    .delay(delay)
                    .duration(500)
                    .ease(d3.easeCubicInOut)
                    .style("opacity", 1)
                    .transition()
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .style("opacity", 1)
                    .transition()
                    .duration(500)
                    .ease(d3.easeCubicInOut)
                    .style("opacity", 0);
            }

            if (isInternalDecision && d.label && d.fullLabel.trim() !== "") {
                const persistentY = d.target.y + (d.target.size || 90) / 2 + 15 + (conditionId === "no-cache" ? (i === 9 ? 0 : i === 12 ? 15 : 30) : (i === 5 ? 0 : i === 6 ? 15 : 30));
                console.log(`Adding persistent success text for step ${i + 1}: ${d.fullLabel}, y: ${persistentY}`);
                persistentTextGroup.append("text")
                    .attr("x", d.target.x)
                    .attr("y", persistentY)
                    .attr("text-anchor", "middle")
                    .attr("fill", d.labelColor)
                    .attr("font-size", "10px")
                    .text(d.fullLabel)
                    .style("opacity", 0)
                    .transition()
                    .delay(delay + 500)
                    .duration(500)
                    .ease(d3.easeCubicInOut)
                    .style("opacity", 1);
            }

            if (d.decision && d.decision.outcome === "success") {
                const checkY = isInternalDecision ?
                    d.target.y - (d.target.size || 90) / 2 - 10 - (conditionId === "no-cache" ? (i === 12 ? 15 : i === 15 ? 30 : 0) : (i === 6 ? 15 : i === 9 ? 30 : 0)) :
                    (d.source.y + d.target.y) / 2 + d.yOffset + 10;
                console.log(`Adding check mark for step ${i + 1}, internal: ${isInternalDecision}, y: ${checkY}`);
                linkGroup.append("path")
                    .attr("class", "decision-check")
                    .attr("d", "M -5,-5 L 0,5 L 10,-10")
                    .attr("stroke", "#66BB6A")
                    .attr("stroke-width", 2)
                    .attr("fill", "none")
                    .attr("transform", `translate(${isInternalDecision ? d.target.x : (d.source.x + d.target.x) / 2}, ${checkY})`)
                    .style("opacity", 0)
                    .transition()
                    .delay(delay + 500)
                    .duration(500)
                    .ease(d3.easeCubicInOut)
                    .style("opacity", 1)
                    .transition()
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .style("opacity", 1)
                    .transition()
                    .duration(500)
                    .ease(d3.easeCubicInOut)
                    .style("opacity", 0);
            }
        });

        svg.select(".overlay").selectAll(".flowing-line")
            .transition()
            .delay(totalDuration)
            .style("opacity", 0.5);

        console.log("Flows rendered on overlay with", links.length, "links");
    } catch (error) {
        console.error("Error in renderFlows:", error);
        alert("Error rendering Flows tab. Check console for details.");
    }
}

function renderFlowLegend() {
    console.log("Rendering flow legend");
    try {
        svg.selectAll(".flow-legend").remove();
        const staticInfoHeight = staticInfo.length * 25 + 20;
        const legendX = 970;
        const legendY = 20 + staticInfoHeight + 10;

        const legendGroup = svg.append("g")
            .attr("class", "flow-legend")
            .attr("transform", `translate(${legendX}, ${legendY})`);

        const legendEntries = [];
        flows.forEach(flow => {
            if (flow.conditions && flow.conditions.length > 1) {
                flow.conditions.forEach(condition => {
                    legendEntries.push({
                        name: `${flow.name} (${condition.id})`,
                        color: flow.color
                    });
                });
            } else {
                legendEntries.push({
                    name: flow.name,
                    color: flow.color
                });
            }
        });

        const legendBoxHeight = legendEntries.length * 25 + 20;
        legendGroup.append("rect")
            .attr("x", -10)
            .attr("y", -10)
            .attr("width", 410)
            .attr("height", legendBoxHeight)
            .attr("fill", "url(#info-gradient)")
            .attr("stroke", "#4A5A5D")
            .attr("stroke-width", 1)
            .attr("rx", 5)
            .style("filter", "url(#drop-shadow)");

        legendEntries.forEach((entry, i) => {
            const entryGroup = legendGroup.append("g")
                .attr("transform", `translate(5, ${i * 25 + 15})`);

            entryGroup.append("rect")
                .attr("x", 0)
                .attr("y", -8)
                .attr("width", 10)
                .attr("height", 10)
                .attr("fill", entry.color);

            entryGroup.append("text")
                .attr("x", 15)
                .attr("y", 0)
                .attr("font-size", "13px")
                .attr("fill", "#E8ECEF")
                .text(entry.name);
        });

        console.log("Flow legend rendered with", legendEntries.length, "entries");
    } catch (error) {
        console.error("Error in renderFlowLegend:", error);
        alert("Error rendering flow legend. Check console for details.");
    }
}

async function renderConnections() {
    console.log("Rendering connections");
    try {
        await loadData();
        svg.selectAll(".overlay").remove();
        const overlay = svg.append("g").attr("class", "overlay");

        d3.selectAll(".tab").classed("active", false);
        d3.select("#layer-connections").classed("active", true);

        if (!flows.length) {
            console.warn("No flows to render connections for");
            alert("Warning: No flows available to display connections.");
            return;
        }

        svg.selectAll(".node")
            .style("opacity", 1);

        const linesToRender = [];
        flows.forEach((flow, flowIndex) => {
            const offset = flowIndex * 5;
            const paths = flow.conditions ? flow.conditions.map(c => ({ path: c.path, condition: c.id })) : [{ path: flow.path, condition: "default" }];
            paths.forEach(({ path, condition }) => {
                const flowLines = path.slice(0, -1).map((sourceId, i) => {
                    const source = nodes.find(n => n.id === sourceId);
                    const target = nodes.find(n => n.id === path[i + 1]);
                    if (!source || !target) {
                        console.error(`Invalid step in flow ${flow.id}, condition ${condition}: source=${sourceId}, target=${path[i + 1]}`);
                        return null;
                    }
                    return {
                        source,
                        target,
                        color: flow.color,
                        offset,
                        flowName: `${flow.name}${flow.conditions && flow.conditions.length > 1 ? ` (${condition})` : ""}`
                    };
                }).filter(line => line !== null);

                linesToRender.push(...flowLines);
            });
        });

        if (!linesToRender.length) {
            console.warn("No valid connections to render after filtering");
            alert("Warning: No valid connections to display.");
            return;
        }
        console.log(`Rendering ${linesToRender.length} connection lines`);

        svg.append("defs").selectAll("marker")
            .data([...new Set(linesToRender.map(d => d.color))])
            .enter().append("marker")
            .attr("id", d => `arrow-${d.replace("#", "")}`)
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 10)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", d => d);

        const link = overlay.selectAll(".link")
            .data(linesToRender)
            .enter().append("g")
            .attr("class", "link");

        link.each(function(d) {
            const linkGroup = d3.select(this);
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length === 0) return;

            const nx = -dy / length;
            const ny = dx / length;
            const offsetX = nx * d.offset;
            const offsetY = ny * d.offset;

            linkGroup.append("line")
                .attr("x1", d.source.x + offsetX)
                .attr("y1", d.source.y + offsetY)
                .attr("x2", d.target.x + offsetX)
                .attr("y2", d.target.y + offsetY)
                .attr("stroke", d.color)
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "5,5")
                .attr("marker-end", `url(#arrow-${d.color.replace("#", "")})`)
                .attr("class", "flowing-line");
        });

        renderFlowLegend();

        console.log("Connections rendered on overlay with", linesToRender.length, "lines");
    } catch (error) {
        console.error("Error in renderConnections:", error);
        alert("Error rendering Connections tab. Check console for details.");
    }
}

async function renderWatchpoints() {
    console.log("Rendering Watchpoints tab");
    try {
        await loadData();
        svg.selectAll(".overlay").remove();
        const overlay = svg.append("g").attr("class", "overlay");
        const watchpointsTab = d3.select("#layer-watchpoints");
        if (watchpointsTab.empty()) {
            console.error("Watchpoints tab element not found");
            alert("Error: Watchpoints tab not found in DOM.");
            return;
        }
        watchpointsTab.classed("active", true);

        svg.selectAll(".node")
            .style("opacity", 1);

        const certGroup = overlay.selectAll(".cert-group")
            .data(nodes)
            .enter().append("g")
            .attr("class", "cert-group")
            .attr("transform", d => {
                console.log(`Rendering watchpoint for ${d.name} at x:${d.x + d.size / 2 + 10}, y:${d.y - d.size / 2}`);
                return `translate(${d.x + d.size / 2 + 10}, ${d.y - d.size / 2})`;
            });

        certGroup.append("text")
            .attr("class", "cert-text")
            .attr("y", 0)
            .attr("fill", "#E8ECEF")
            .attr("font-size", "11px")
            .text(d => d.certificates.keystore.split('_').pop())
            .style("cursor", "pointer")
            .on("mouseover", function(event, d) {
                console.log("Hover over cert for:", d.name);
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "drop-shadow(0 0 5px #4A90E2)");
            })
            .on("mouseout", function(event, d) {
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "none");
            });

        certGroup.append("text")
            .attr("class", "cert-text")
            .attr("y", 15)
            .attr("fill", "#E8ECEF")
            .attr("font-size", "11px")
            .text(d => d.certificates.truststore.split('_').pop())
            .style("cursor", "pointer")
            .on("mouseover", function(event, d) {
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "drop-shadow(0 0 5px #4A90E2)");
            })
            .on("mouseout", function(event, d) {
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "none");
            });

        certGroup.filter(d => d.certificates.signing_cert)
            .append("text")
            .attr("class", "cert-text")
            .attr("y", 30)
            .attr("fill", "#E8ECEF")
            .attr("font-size", "11px")
            .text(d => d.certificates.signing_cert)
            .style("cursor", "pointer")
            .on("mouseover", function(event, d) {
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "drop-shadow(0 0 5px #4A90E2)");
            })
            .on("mouseout", function(event, d) {
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "none");
            });

        certGroup.filter(d => d.certificates.signing_key)
            .append("text")
            .attr("class", "cert-text")
            .attr("y", 30)
            .attr("fill", "#E8ECEF")
            .attr("font-size", "11px")
            .text(d => d.certificates.signing_key)
            .style("cursor", "pointer")
            .on("mouseover", function(event, d) {
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "drop-shadow(0 0 5px #4A90E2)");
            })
            .on("mouseout", function(event, d) {
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "none");
            });

        certGroup.filter(d => d.certificates.signing_hsm)
            .append("text")
            .attr("class", "cert-text")
            .attr("y", 30)
            .attr("fill", "#E8ECEF")
            .attr("font-size", "11px")
            .text(d => d.certificates.signing_hsm)
            .style("cursor", "pointer")
            .on("mouseover", function(event, d) {
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "drop-shadow(0 0 5px #4A90E2)");
            })
            .on("mouseout", function(event, d) {
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "none");
            });

        console.log("Watchpoints tab rendered with certificates for", nodes.length, "systems");
    } catch (error) {
        console.error("Error in renderWatchpoints:", error);
        svg.selectAll(".overlay").remove();
        svg.append("g")
            .attr("class", "overlay")
            .append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#EF5350")
            .attr("font-size", "16px")
            .text("Error rendering Watchpoints tab. Check console.");
    }
}

async function updateFlowOptions() {
    console.log("Updating flow options");
    try {
        await loadData();
        const flowSelect = d3.select("#flow-select");
        flowSelect.selectAll("option").remove();
        flowSelect.selectAll("option")
            .data(flows)
            .enter().append("option")
            .attr("value", d => d.id)
            .text(d => d.name);

        const conditionSelect = d3.select("#condition-select");
        conditionSelect.selectAll("option").remove();
        conditionSelect.on("change", function() {
            svg.selectAll(".overlay").remove();
            const selectedFlow = d3.select("#flow-select").property("value");
            const selectedCondition = this.value;
            console.log("Condition changed:", selectedCondition);
            renderFlows(selectedFlow, selectedCondition);
        });

        d3.select("#flow-select").on("change", function() {
            svg.selectAll(".overlay").remove();
            const selectedFlow = this.value;
            console.log("Flow changed:", selectedFlow);
            const flow = flows.find(f => f.id === selectedFlow);
            conditionSelect.selectAll("option").remove();
            conditionSelect.selectAll("option")
                .data(flow.conditions)
                .enter().append("option")
                .attr("value", d => d.id)
                .text(d => d.name);
            renderFlows(selectedFlow, flow.conditions[0].id);
        });

        const firstFlow = flows[0];
        conditionSelect.selectAll("option")
            .data(firstFlow.conditions)
            .enter().append("option")
            .attr("value", d => d.id)
            .text(d => d.name);
        console.log("Flow options initialized with", flows.length, "flows");
    } catch (error) {
        console.error("Error in updateFlowOptions:", error);
        alert("Error updating flow options. Check console.");
    }
}

async function renderImpactAnalysis() {
    console.log("Rendering Impact Analysis tab");
    try {
        await loadData();
        svg.selectAll(".overlay").remove();
        const overlay = svg.append("g").attr("class", "overlay");

        d3.selectAll(".tab").classed("active", false);
        d3.select("#layer-impact-analysis").classed("active", true);

        d3.select("#reset-button").remove();
        d3.select("body").append("button")
            .attr("id", "reset-button")
            .style("position", "absolute")
            .style("top", "10px")
            .style("right", "10px")
            .style("background-color", "#4A90E2")
            .style("color", "#E8ECEF")
            .style("border", "none")
            .style("padding", "8px 16px")
            .style("border-radius", "4px")
            .style("cursor", "pointer")
            .style("font-size", "14px")
            .text("Reset Simulation")
            .on("mouseover", function() {
                d3.select(this).style("background-color", "#3A78C2");
            })
            .on("mouseout", function() {
                d3.select(this).style("background-color", "#4A90E2");
            })
            .on("click", () => {
                nodes.forEach(node => {
                    node.crashed = false;
                    node.hovered = false;
                });
                updateImpactVisualization();
            });

        svg.selectAll(".node")
            .style("opacity", 1);

        svg.selectAll(".node").select("rect, path")
            .on("mouseover", null)
            .on("mouseout", null)
            .on("click", null);

        svg.selectAll(".node").select("rect, path")
            .style("cursor", "pointer")
            .on("click", function(event, d) {
                d.crashed = !d.crashed;
                updateImpactVisualization();
            })
            .on("mouseover", function(event, d) {
                d.hovered = true;
                previewImpact(d.id);
                tooltip.transition().duration(200).style("opacity", 0.9);
                let html = `
                    <strong>Service:</strong> ${d.name}<br>
                    <strong>ID:</strong> ${d.id}<br>
                    <strong>Endpoint:</strong> ${d.endpoint}<br>
                    <strong>Method:</strong> ${d.method}<br>
                    <strong>Details:</strong> ${d.details}<br>
                    <strong>Certificates:</strong><br>
                      Keystore: ${d.certificates.keystore}<br>
                      Truststore: ${d.certificates.truststore}
                `;
                if (d.certificates.signing_cert) {
                    html += `<br>  Signing Cert: ${d.certificates.signing_cert}`;
                }
                if (d.certificates.signing_key) {
                    html += `<br>  Signing Key: ${d.certificates.signing_key}`;
                }
                if (d.certificates.signing_hsm) {
                    html += `<br>  Signing HSM: ${d.certificates.signing_hsm}`;
                }
                tooltip.html(html)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", function(event, d) {
                d.hovered = false;
                clearPreview();
                tooltip.transition().duration(500).style("opacity", 0);
            });

        function updateImpactVisualization() {
            const crashedServers = nodes.filter(n => n.crashed).map(n => n.id);
            const impactedFlows = flows.filter(flow =>
                flow.conditions.some(condition =>
                    condition.path.some(nodeId => crashedServers.includes(nodeId))
                )
            );
            const intactFlows = flows.filter(flow => !impactedFlows.includes(flow));

            svg.selectAll(".node").each(function(d) {
                const g = d3.select(this);
                if (d.shape === "square") {
                    g.select("rect")
                        .attr("fill", d.crashed ? "gray" : "none")
                        .attr("stroke", d.crashed ? "gray" : d.color);
                } else if (d.shape === "cylinder") {
                    g.select("path")
                        .attr("fill", d.crashed ? "gray" : "none")
                        .attr("stroke", d.crashed ? "gray" : d.color);
                }
                g.select(".crash-indicator")
                    .style("opacity", (d.crashed || d.hovered) ? 1 : 0);
            });

            const impactedLines = [];
            impactedFlows.forEach((flow, flowIndex) => {
                const offset = flowIndex * 5;
                flow.conditions.forEach(condition => {
                    const path = condition.path;
                    const steps = path.slice(0, -1).map((sourceId, i) => {
                        const source = nodes.find(n => n.id === sourceId);
                        const target = nodes.find(n => n.id === path[i + 1]);
                        if (!source || !target) return null;
                        return { source, target, flowName: flow.name, condition: condition.id };
                    }).filter(step => step !== null);
                    steps.forEach(step => {
                        impactedLines.push({
                            source: step.source,
                            target: step.target,
                            flowName: `${step.flowName} (${step.condition})`,
                            offset
                        });
                    });
                });
            });

            const intactLines = [];
            intactFlows.forEach((flow, flowIndex) => {
                const offset = (flowIndex + impactedFlows.length) * 5;
                flow.conditions.forEach(condition => {
                    const path = condition.path;
                    const steps = path.slice(0, -1).map((sourceId, i) => {
                        const source = nodes.find(n => n.id === sourceId);
                        const target = nodes.find(n => n.id === path[i + 1]);
                        if (!source || !target) return null;
                        return { source, target, flowName: flow.name, condition: condition.id };
                    }).filter(step => step !== null);
                    steps.forEach(step => {
                        intactLines.push({
                            source: step.source,
                            target: step.target,
                            flowName: `${step.flowName} (${step.condition})`,
                            offset
                        });
                    });
                });
            });

            overlay.selectAll(".flow-line").remove();

            const impactedLink = overlay.selectAll(".impacted-flow-line")
                .data(impactedLines)
                .enter().append("g")
                .attr("class", "flow-line impacted-flow-line");

            impactedLink.each(function(d) {
                const linkGroup = d3.select(this);
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length === 0) return;

                const nx = -dy / length;
                const ny = dx / length;
                const offsetX = nx * d.offset;
                const offsetY = ny * d.offset;

                linkGroup.append("line")
                    .attr("x1", d.source.x + offsetX)
                    .attr("y1", d.source.y + offsetY)
                    .attr("x2", d.target.x + offsetX)
                    .attr("y2", d.target.y + offsetY)
                    .attr("stroke", "#EF5350")
                    .attr("stroke-width", 2)
                    .attr("stroke-dasharray", "5,5")
                    .style("cursor", "pointer")
                    .on("mouseover", function(event, d) {
                        tooltip.transition().duration(200).style("opacity", 0.9);
                        tooltip.html(`<strong>Flow:</strong> ${d.flowName}<br><strong>Status:</strong> Impacted`)
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY - 28) + "px");
                    })
                    .on("mouseout", function() {
                        tooltip.transition().duration(500).style("opacity", 0);
                    });
            });

            const intactLink = overlay.selectAll(".intact-flow-line")
                .data(intactLines)
                .enter().append("g")
                .attr("class", "flow-line intact-flow-line");

            intactLink.each(function(d) {
                const linkGroup = d3.select(this);
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length === 0) return;

                const nx = -dy / length;
                const ny = dx / length;
                const offsetX = nx * d.offset;
                const offsetY = ny * d.offset;

                linkGroup.append("line")
                    .attr("x1", d.source.x + offsetX)
                    .attr("y1", d.source.y + offsetY)
                    .attr("x2", d.target.x + offsetX)
                    .attr("y2", d.target.y + offsetY)
                    .attr("stroke", "#66BB6A")
                    .attr("stroke-width", 2)
                    .attr("stroke-dasharray", "5,5")
                    .style("cursor", "pointer")
                    .on("mouseover", function(event, d) {
                        tooltip.transition().duration(200).style("opacity", 0.9);
                        tooltip.html(`<strong>Flow:</strong> ${d.flowName}<br><strong>Status:</strong> Intact`)
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY - 28) + "px");
                    })
                    .on("mouseout", function() {
                        tooltip.transition().duration(500).style("opacity", 0);
                    });
            });

            const impactedNodes = new Set();
            impactedFlows.forEach(flow => {
                flow.conditions.forEach(condition => {
                    condition.path.forEach(nodeId => impactedNodes.add(nodeId));
                });
            });

            const intactNodes = new Set();
            intactFlows.forEach(flow => {
                flow.conditions.forEach(condition => {
                    condition.path.forEach(nodeId => {
                        if (!impactedNodes.has(nodeId)) {
                            intactNodes.add(nodeId);
                        }
                    });
                });
            });

            svg.selectAll(".node").each(function(d) {
                const g = d3.select(this);
                if (impactedNodes.has(d.id)) {
                    g.select("rect, path")
                        .style("filter", "drop-shadow(0 0 5px #EF5350)");
                } else if (intactNodes.has(d.id)) {
                    g.select("rect, path")
                        .style("filter", "drop-shadow(0 0 5px #66BB6A)");
                } else {
                    g.select("rect, path")
                        .style("filter", "none");
                }
            });

            renderFlowLegendImpact(impactedFlows, intactFlows);
        }

        function previewImpact(serverId) {
            const impactedFlows = flows.filter(flow =>
                flow.conditions.some(condition =>
                    condition.path.includes(serverId)
                )
            );
            const intactFlows = flows.filter(flow => !impactedFlows.includes(flow));
            renderFlowLegendImpact(impactedFlows, intactFlows, true);
            svg.selectAll(".node").each(function(d) {
                const g = d3.select(this);
                g.select(".crash-indicator")
                    .style("opacity", (d.crashed || d.hovered) ? 1 : 0);
            });
        }

        function clearPreview() {
            updateImpactVisualization();
        }

        updateImpactVisualization();
    } catch (error) {
        console.error("Error in renderImpactAnalysis:", error);
        alert("Error rendering Impact Analysis tab. Check console for details.");
    }
}

function renderFlowLegendImpact(impactedFlows = [], intactFlows = [], isPreview = false) {
    console.log("Rendering flow legend for Impact Analysis", { impactedFlows, intactFlows, isPreview });
    try {
        svg.selectAll(".flow-legend").remove();
        const staticInfoHeight = staticInfo.length * 25 + 20;
        const legendX = 970;
        const legendY = 20 + staticInfoHeight + 10;

        const legendGroup = svg.append("g")
            .attr("class", "flow-legend")
            .attr("transform", `translate(${legendX}, ${legendY})`);

        const impactedEntries = [];
        impactedFlows.forEach(flow => {
            if (flow.conditions && flow.conditions.length > 1) {
                flow.conditions.forEach(condition => {
                    impactedEntries.push({
                        name: `${flow.name} (${condition.id})`,
                        color: flow.color,
                        flowObj: flow
                    });
                });
            } else {
                impactedEntries.push({
                    name: flow.name,
                    color: flow.color,
                    flowObj: flow
                });
            }
        });

        const intactEntries = [];
        intactFlows.forEach(flow => {
            if (flow.conditions && flow.conditions.length > 1) {
                flow.conditions.forEach(condition => {
                    intactEntries.push({
                        name: `${flow.name} (${condition.id})`,
                        color: flow.color,
                        flowObj: flow
                    });
                });
            } else {
                intactEntries.push({
                    name: flow.name,
                    color: flow.color,
                    flowObj: flow
                });
            }
        });

        let yOffset = 0;
        if (impactedEntries.length > 0) {
            legendGroup.append("text")
                .attr("x", 5)
                .attr("y", yOffset + 15)
                .attr("font-size", "14px")
                .attr("font-weight", "bold")
                .attr("fill", "#EF5350")
                .text("Impacted Flows");
            yOffset += 25;

            impactedEntries.forEach((entry, i) => {
                const entryGroup = legendGroup.append("g")
                    .attr("transform", `translate(5, ${yOffset + i * 25 + 15})`);

                entryGroup.append("rect")
                    .attr("x", 0)
                    .attr("y", -8)
                    .attr("width", 10)
                    .attr("height", 10)
                    .attr("fill", isPreview ? "#FFA500" : "#EF5350");

                entryGroup.append("text")
                    .attr("x", 15)
                    .attr("y", 0)
                    .attr("font-size", "13px")
                    .attr("fill", "#E8ECEF")
                    .text(entry.name);
            });
            yOffset += impactedEntries.length * 25 + 10;
        }

        if (intactEntries.length > 0) {
            legendGroup.append("text")
                .attr("x", 5)
                .attr("y", yOffset + 15)
                .attr("font-size", "14px")
                .attr("font-weight", "bold")
                .attr("fill", "#66BB6A")
                .text("Intact Flows");
            yOffset += 25;

            intactEntries.forEach((entry, i) => {
                const entryGroup = legendGroup.append("g")
                    .attr("transform", `translate(5, ${yOffset + i * 25 + 15})`);

                entryGroup.append("rect")
                    .attr("x", 0)
                    .attr("y", -8)
                    .attr("width", 10)
                    .attr("height", 10)
                    .attr("fill", "#66BB6A");

                entryGroup.append("text")
                    .attr("x", 15)
                    .attr("y", 0)
                    .attr("font-size", "13px")
                    .attr("fill", "#E8ECEF")
                    .text(entry.name);
            });
            yOffset += intactEntries.length * 25;
        }

        const legendBoxHeight = yOffset + 20;
        legendGroup.insert("rect", ":first-child")
            .attr("x", -10)
            .attr("y", -10)
            .attr("width", 410)
            .attr("height", legendBoxHeight)
            .attr("fill", "url(#info-gradient)")
            .attr("stroke", "#4A5A5D")
            .attr("stroke-width", 1)
            .attr("rx", 5)
            .style("filter", "url(#drop-shadow)");

        console.log("Flow legend for Impact Analysis rendered with", impactedEntries.length + intactEntries.length, "entries");
    } catch (error) {
        console.error("Error in renderFlowLegendImpact:", error);
        alert("Error rendering flow legend for Impact Analysis. Check console for details.");
    }
}

console.log("Starting initialization");
(async () => {
    console.log("Executing initialization block");
    try {
        await loadData();
        console.log("Data loaded, initializing blueprint");
        initBlueprint();
        console.log("Blueprint initialized, rendering static info");
        renderStaticInfo();
        console.log("Static info rendered, rendering blueprint");
        renderBlueprint();
        console.log("Blueprint rendered, updating flow options");
        await updateFlowOptions();
        console.log("Initialization completed successfully");
    } catch (error) {
        console.error("Initialization failed:", error);
        alert("Initialization failed: " + error.message + ". Check console for details.");
    }
})();

const setupEventListeners = () => {
    console.log("Setting up event listeners");
    const infrastructureTab = document.getElementById("layer-infrastructure");
    const flowsTab = document.getElementById("layer-flows");
    const watchpointsTab = document.getElementById("layer-watchpoints");
    const connectionsTab = document.getElementById("layer-connections");
    const impactAnalysisTab = document.getElementById("layer-impact-analysis");
    const flowSelect = document.getElementById("flow-select");
    const conditionSelect = document.getElementById("condition-select");

    if (!infrastructureTab || !flowsTab || !watchpointsTab || !connectionsTab || !impactAnalysisTab || !flowSelect || !conditionSelect) {
        console.error("One or more DOM elements not found:", {
            infrastructureTab, flowsTab, watchpointsTab, connectionsTab, impactAnalysisTab, flowSelect, conditionSelect
        });
        alert("Error: DOM elements missing. Check index.html for correct IDs.");
        return;
    }

    infrastructureTab.addEventListener("click", () => {
        console.log("Clicked Infrastructure tab");
        svg.selectAll(".overlay").remove();
        renderBlueprint();
    });

    flowsTab.addEventListener("click", () => {
        console.log("Clicked Flows tab");
        svg.selectAll(".overlay").remove();
        const flowId = flowSelect.value;
        const conditionId = conditionSelect.value || "default";
        renderFlows(flowId, conditionId);
    });

    watchpointsTab.addEventListener("click", () => {
        console.log("Clicked Watchpoints tab");
        svg.selectAll(".overlay").remove();
        renderWatchpoints();
    });

    connectionsTab.addEventListener("click", () => {
        console.log("Clicked Connections tab");
        svg.selectAll(".overlay").remove();
        renderConnections();
    });

    impactAnalysisTab.addEventListener("click", () => {
        console.log("Clicked Impact Analysis tab");
        svg.selectAll(".overlay").remove();
        renderImpactAnalysis();
    });

    flowSelect.addEventListener("change", function() {
        console.log("Flow select changed:", this.value);
        svg.selectAll(".overlay").remove();
        const flowId = this.value;
        const flow = flows.find(f => f.id === flowId);
        conditionSelect.value = flow.conditions[0].id;
        renderFlows(flowId, flow.conditions[0].id);
    });

    console.log("Event listeners setup completed");
};

setupEventListeners();

const zoom = d3.zoom()
    .scaleExtent([0.5, 3])
    .filter(event => event.type === "wheel" || event.touches)
    .on("zoom", (event) => {
        svg.selectAll("g")
            .transition()
            .duration(200)
            .ease(d3.easeCubicInOut)
            .attr("transform", event.transform);
    });
svg.call(zoom);

svg.on("dblclick.zoom", () => {
    svg.transition()
        .duration(750)
        .ease(d3.easeCubicInOut)
        .call(zoom.transform, d3.zoomIdentity);
});
