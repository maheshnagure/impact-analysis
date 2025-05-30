console.log("Script start at", new Date().toISOString());
console.log("D3:", typeof d3 !== "undefined" ? d3.version : "Not loaded");

if (typeof d3 === "undefined") {
    console.error("D3.js is not loaded. Ensure the D3 script is included in index.html.");
    alert("Error: D3.js is not loaded. Check console for details.");
    throw new Error("D3.js not loaded");
}

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

const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);
console.log("Tooltip created");

svg.append("defs")
    .append("path")
    .attr("id", "gear-icon")
    .attr("d", "M12,8a4,4,0,1,0,4,4A4,4,0,0,0,12,8Zm0,6a2,2,0,1,1,2-2A2,2,0,0,1,12,14Zm8-2a1,1,0,0,1-1,1H17.414a5.966,5.966,0,0,1-.829,2.293l1.293,1.293a1,1,0,0,1-1.414,1.414L15.121,16.707A5.966,5.966,0,0,1,12.829,17.414V19a1,1,0,0,1-2,0V17.414a5.966,5.966,0,0,1-2.293-.829L7.243,17.878a1,1,0,0,1-1.414-1.414L7.122,15.171A5.966,5.966,0,0,1,6.414,12.829H5a1,1,0,0,1,0-2H6.414a5.966,5.966,0,0,1,.829-2.293L5.95,7.243a1,1,0,0,1,1.414-1.414L8.657,7.122A5.966,5.966,0,0,1,10.95,6.414V5a1,1,0,0,1,2,0V6.414a5.966,5.966,0,0,1,2.293.829L16.536,5.95a1,1,0,0,1,1.414,1.414L16.657,8.657A5.966,5.966,0,0,1,17.414,10.95H19A1,1,0,0,1,20,12Z")
    .attr("transform", "scale(2.5) translate(-12, -12)");

async function loadData() {
    console.log("Loading infrastructure.json at", new Date().toISOString());
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
            hovered: false,
            processing: false
        }));
        flows = Object.keys(jsonData.blueprint.flows).flatMap(key =>
            jsonData.blueprint.flows[key].map(flow => ({
                id: key,
                name: flow.name,
                type: flow.type,
                color: flow.color,
                conditions: flow.conditions || [{
                    id: "default",
                    name: "Default",
                    path: flow.path,
                    labels: flow.labels || flow.path.map((_, i) => ({text: `#${i + 1}`, color: "#FFFFFF"})),
                    decisions: flow.decisions || [],
                    pause: flow.pause || 2000,
                    color: flow.color
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
            .attr("fill", "#FF0000")
            .attr("font-size", "16px")
            .text("Error loading infrastructure.json: " + error.message);
        throw error;
    }
}

function initBlueprint() {
    console.log("Initializing persistent blueprint at", new Date().toISOString());
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
                .attr("fill", "#FF0000")
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
                    .attr("rx", 10)
                    .attr("ry", 10)
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
                    d.hovered = true;
                    d.processing = true;
                    updateProcessingIndicator(g, d);
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
                    d.hovered = false;
                    d.processing = false;
                    updateProcessingIndicator(g, d);
                    tooltip.transition().duration(500).style("opacity", 0);
                })
                .on("click", function() {
                    console.log("Clicked shape:", d.name);
                    const slug = d.name.toLowerCase().replace(/\s+/g, '-');
                    window.location.href = `details.html?app=${slug}`;
                });

            g.append("text")
                .attr("dx", 0)
                .attr("dy", d => -(d.shape === "cylinder" ? d.size : d.size / 2) - 5)
                .attr("text-anchor", "middle")
                .attr("font-size", "14px")
                .attr("font-weight", "bold")
                .attr("fill", "#E0E0E0")
                .style("text-shadow", "1px 1px 2px #000000")
                .text(d => {
                    console.log(`Rendering label for node ${d.id}: ${d.name}`);
                    return d.name || "Unknown";
                });

            g.append("text")
                .attr("class", "crash-indicator")
                .attr("text-anchor", "middle")
                .attr("dy", ".35em")
                .attr("fill", "red")
                .style("font-size", d => `${d.size / 2}px`)
                .style("opacity", 0)
                .text("X");

            g.append("use")
                .attr("class", "processing-gear")
                .attr("href", "#gear-icon")
                .attr("fill", d.color)
                .style("opacity", 0);
        });

        console.log("Persistent blueprint initialized with", node.size(), "nodes");
    } catch (error) {
        console.error("Error in initBlueprint:", error);
        alert("Error initializing blueprint: " + error.message + ". Check console for details.");
        svg.append("g")
            .attr("class", "error-message")
            .append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#FF0000")
            .attr("font-size", "16px")
            .text("Error initializing blueprint: " + error.message);
    }
}

function updateProcessingIndicator(g, d) {
    g.select(".processing-gear")
        .style("opacity", d.processing ? 1 : 0);
}

function renderStaticInfo() {
    console.log("Rendering static info box at", new Date().toISOString());
    try {
        svg.selectAll(".static-info").remove();
        const infoGroup = svg.append("g")
            .attr("class", "static-info")
            .attr("transform", "translate(970, 20)");

        const infoBox = infoGroup.append("rect")
            .attr("x", -5)
            .attr("y", -5)
            .attr("width", 400)
            .attr("height", staticInfo.length * 20 + 10)
            .attr("fill", "#2E3B3E")
            .attr("stroke", "#4A5A5D")
            .attr("stroke-width", 1)
            .attr("rx", 5);

        infoGroup.selectAll(".info-text")
            .data(staticInfo)
            .enter().append("text")
            .attr("class", "info-text")
            .attr("x", 5)
            .attr("y", (d, i) => i * 20 + 10)
            .attr("font-size", d => d.font_size || "12px")
            .attr("font-weight", d => d.font_weight || "normal")
            .attr("fill", d => d.color || "#E0E0E0")
            .text(d => d.text);
        console.log("Static info box rendered with", staticInfo.length, "lines");
    } catch (error) {
        console.error("Error in renderStaticInfo:", error);
        alert("Error rendering static info box: " + error.message + ". Check console for details.");
        svg.append("g")
            .attr("class", "error-message")
            .append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#FF0000")
            .attr("font-size", "16px")
            .text("Error rendering static info: " + error.message);
    }
}

async function renderBlueprint() {
    console.log("Rendering Infrastructure tab at", new Date().toISOString());
    try {
        await loadData();
        svg.selectAll(".overlay").remove();
        d3.selectAll(".tab").classed("active", false);
        d3.select("#layer-infrastructure").classed("active", true);
        initBlueprint();
        renderStaticInfo();
        svg.selectAll(".node")
            .style("opacity", 1);
        console.log("Infrastructure tab rendered");
    } catch (error) {
        console.error("Error in renderBlueprint:", error);
        alert("Error rendering Infrastructure tab: " + error.message + ". Check console for details.");
        svg.append("g")
            .attr("class", "error-message")
            .append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#FF0000")
            .attr("font-size", "16px")
            .text("Error rendering Infrastructure tab: " + error.message);
    }
}

function adjustLineToEdge(source, target, sizeSource, sizeTarget) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return { x1: source.x, y1: source.y, x2: target.x, y2: target.y };

    const offsetSource = sizeSource / 2;
    const offsetTarget = sizeTarget / 2;

    const ratioSource = offsetSource / distance;
    const ratioTarget = offsetTarget / distance;

    const x1 = source.x + dx * ratioSource;
    const y1 = source.y + dy * ratioSource;
    const x2 = target.x - dx * ratioTarget;
    const y2 = target.y - dy * ratioTarget;

    return { x1, y1, x2, y2 };
}

async function renderFlows(flowId, conditionId = "default") {
    console.log(`Rendering flow: ${flowId}, condition: ${conditionId} at`, new Date().toISOString());
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
        const labels = condition.labels || path.map((_, i) => ({text: `#${i + 1}`, color: "#FFFFFF"}));
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
            .attr("id", d => `arrow-${color.replace("#", "")}`)
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
                label: labels[i] || {text: "", color: "#FFFFFF"},
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
            labelColor: step.label.color || "#FFFFFF",
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
            progressBar.style("width", `${progress}%`);
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

        line.each(function(d) {
            const adjusted = adjustLineToEdge(d.source, d.target, d.source.size, d.target.size);
            d3.select(this).append("line")
                .attr("x1", adjusted.x1)
                .attr("y1", adjusted.y1)
                .attr("x2", adjusted.x2)
                .attr("y2", adjusted.y2)
                .attr("stroke", color)
                .attr("stroke-width", 2)
                .attr("marker-end", `url(#arrow-${color.replace("#", "")})`)
                .attr("class", "flowing-line")
                .style("opacity", 0);
        });

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
                .style("fill", "#90EE90")
                .on("start", function() {
                    targetNode.each(function(targetData) {
                        targetData.processing = true;
                        updateProcessingIndicator(d3.select(this), targetData);
                    });
                })
                .transition()
                .duration(1000)
                .style("fill", "#90EE90")
                .transition()
                .duration(500)
                .style("fill", "none")
                .on("end", function() {
                    targetNode.each(function(targetData) {
                        targetData.processing = false;
                        updateProcessingIndicator(d3.select(this), targetData);
                    });
                });

            console.log(`Target node: ${d.target.name}, ID: ${d.target.id}, x: ${d.target.x}, y: ${d.target.y}, size: ${d.target.size}`);

            if (d.source.id !== d.target.id) {
                linkGroup.select("line").transition()
                    .delay(delay)
                    .duration(500)
                    .style("opacity", 1)
                    .transition()
                    .duration(1000)
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
                    .attr("font-size", isInternalDecision ? "10px" : "11px")
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
                    .style("opacity", 1)
                    .transition()
                    .duration(1000)
                    .style("opacity", 1)
                    .transition()
                    .duration(500)
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
                    .attr("stroke", "#00FF00")
                    .attr("stroke-width", 2)
                    .attr("fill", "none")
                    .attr("transform", `translate(${isInternalDecision ? d.target.x : (d.source.x + d.target.x) / 2}, ${checkY})`)
                    .style("opacity", 0)
                    .transition()
                    .delay(delay + 500)
                    .duration(500)
                    .style("opacity", 1)
                    .transition()
                    .duration(1000)
                    .style("opacity", 1)
                    .transition()
                    .duration(500)
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
        alert("Error rendering Flows tab: " + error.message + ". Check console for details.");
        svg.append("g")
            .attr("class", "error-message")
            .append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#FF0000")
            .attr("font-size", "16px")
            .text("Error rendering Flows tab: " + error.message);
    }
}

function renderFlowLegend() {
    console.log("Rendering flow legend at", new Date().toISOString());
    try {
        svg.selectAll(".flow-legend").remove();
        const staticInfoHeight = staticInfo.length * 20 + 10;
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

        const legendBoxHeight = legendEntries.length * 20 + 10;
        legendGroup.append("rect")
            .attr("x", -5)
            .attr("y", -5)
            .attr("width", 400)
            .attr("height", legendBoxHeight)
            .attr("fill", "#2E3B3E")
            .attr("stroke", "#4A5A5D")
            .attr("stroke-width", 1)
            .attr("rx", 5);

        legendEntries.forEach((entry, i) => {
            const entryGroup = legendGroup.append("g")
                .attr("transform", `translate(5, ${i * 20 + 10})`);

            entryGroup.append("rect")
                .attr("x", 0)
                .attr("y", -8)
                .attr("width", 10)
                .attr("height", 10)
                .attr("fill", entry.color);

            entryGroup.append("text")
                .attr("x", 15)
                .attr("y", 0)
                .attr("font-size", "12px")
                .attr("fill", "#E0E0E0")
                .text(entry.name);
        });

        console.log("Flow legend rendered with", legendEntries.length, "entries");
    } catch (error) {
        console.error("Error in renderFlowLegend:", error);
        alert("Error rendering flow legend: " + error.message + ". Check console for details.");
        svg.append("g")
            .attr("class", "error-message")
            .append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#FF0000")
            .attr("font-size", "16px")
            .text("Error rendering flow legend: " + error.message);
    }
}

async function renderConnections() {
    console.log("Rendering connections at", new Date().toISOString());
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
            .style("opacity", 1)
            .each(function(d) {
                const g = d3.select(this);
                if (d.shape === "square") {
                    g.select("rect")
                        .attr("fill", d.color)
                        .attr("fill-opacity", 0.2);
                }
            });

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
            const adjusted = adjustLineToEdge(d.source, d.target, d.source.size, d.target.size);
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length === 0) return;

            const nx = -dy / length;
            const ny = dx / length;
            const offsetX = nx * d.offset;
            const offsetY = ny * d.offset;

            linkGroup.append("line")
                .attr("x1", adjusted.x1 + offsetX)
                .attr("y1", adjusted.y1 + offsetY)
                .attr("x2", adjusted.x2 + offsetX)
                .attr("y2", adjusted.y2 + offsetY)
                .attr("stroke", d.color)
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "5,5")
                .attr("marker-end", `url(#arrow-${d.color.replace("#", "")})`)
                .attr("class", "flowing-line")
                .style("cursor", "pointer")
                .on("mouseover", function(event) {
                    tooltip.transition().duration(200).style("opacity", 0.9);
                    tooltip.html(`<strong>Flow:</strong> ${d.flowName}`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mouseout", function() {
                    tooltip.transition().duration(500).style("opacity", 0);
                });
        });

        renderFlowLegend();

        console.log("Connections rendered on overlay with", linesToRender.length, "lines");
    } catch (error) {
        console.error("Error in renderConnections:", error);
        alert("Error rendering Connections tab: " + error.message + ". Check console for details.");
        svg.append("g")
            .attr("class", "error-message")
            .append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#FF0000")
            .attr("font-size", "16px")
            .text("Error rendering Connections tab: " + error.message);
    }
}

async function renderWatchpoints() {
    console.log("Rendering Watchpoints tab at", new Date().toISOString());
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
            .attr("fill", "#FFFFFF")
            .attr("font-size", "11px")
            .text(d => d.certificates.keystore.split('_').pop())
            .style("cursor", "pointer")
            .on("mouseover", function(event, d) {
                console.log("Hover over cert for:", d.name);
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "drop-shadow(0 0 5px #00A1D6)");
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
            .attr("fill", "#FFFFFF")
            .attr("font-size", "11px")
            .text(d => d.certificates.truststore.split('_').pop())
            .style("cursor", "pointer")
            .on("mouseover", function(event, d) {
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "drop-shadow(0 0 5px #00A1D6)");
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
            .attr("fill", "#FFFFFF")
            .attr("font-size", "11px")
            .text(d => d.certificates.signing_cert)
            .style("cursor", "pointer")
            .on("mouseover", function(event, d) {
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "drop-shadow(0 0 5px #00A1D6)");
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
            .attr("fill", "#FFFFFF")
            .attr("font-size", "11px")
            .text(d => d.certificates.signing_key)
            .style("cursor", "pointer")
            .on("mouseover", function(event, d) {
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "drop-shadow(0 0 5px #00A1D6)");
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
            .attr("fill", "#FFFFFF")
            .attr("font-size", "11px")
            .text(d => d.certificates.signing_hsm)
            .style("cursor", "pointer")
            .on("mouseover", function(event, d) {
                svg.selectAll(".node")
                    .filter(n => n.id === d.id)
                    .select("rect, path")
                    .style("filter", "drop-shadow(0 0 5px #00A1D6)");
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
        alert("Error rendering Watchpoints tab: " + error.message + ". Check console for details.");
        svg.append("g")
            .attr("class", "error-message")
            .append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#FF0000")
            .attr("font-size", "16px")
            .text("Error rendering Watchpoints tab: " + error.message);
    }
}

async function updateFlowOptions() {
    console.log("Updating flow options at", new Date().toISOString());
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
        alert("Error updating flow options: " + error.message + ". Check console for details.");
        svg.append("g")
            .attr("class", "error-message")
            .append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#FF0000")
            .attr("font-size", "16px")
            .text("Error updating flow options: " + error.message);
    }
}

async function renderImpactAnalysis() {
    console.log("Rendering Impact Analysis tab at", new Date().toISOString());
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
            .style("background-color", "#00A1D6")
            .style("color", "#FFFFFF")
            .style("border", "none")
            .style("padding", "8px 16px")
            .style("border-radius", "4px")
            .style("cursor", "pointer")
            .style("font-size", "14px")
            .text("Reset Simulation")
            .on("mouseover", function() {
                d3.select(this).style("background-color", "#008BB5");
            })
            .on("mouseout", function() {
                d3.select(this).style("background-color", "#00A1D6");
            })
            .on("click", () => {
                console.log("Reset Simulation clicked");
                nodes.forEach(node => {
                    node.crashed = false;
                    node.hovered = false;
                    node.processing = false;
                });
                svg.selectAll(".node").each(function(d) {
                    const g = d3.select(this);
                    updateProcessingIndicator(g, d);
                    if (d.shape === "square") {
                        g.select("rect")
                            .attr("fill", "none")
                            .attr("stroke", d.color);
                    } else if (d.shape === "cylinder") {
                        g.select("path")
                            .attr("fill", "none")
                            .attr("stroke", d.color);
                    }
                    g.select(".crash-indicator")
                        .style("opacity", 0);
                    g.select("rect, path")
                        .style("filter", "none");
                });
                svg.selectAll(".overlay").selectAll(".flow-line").remove();
                renderFlowLegendImpact([], []);
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
                console.log("Clicked server:", d.name, "Crashed:", !d.crashed);
                d.crashed = !d.crashed;
                updateImpactVisualization();
            })
            .on("mouseover", function(event, d) {
                console.log("Hover over server:", d.name);
                d.hovered = true;
                d.processing = true;
                const g = d3.select(this.parentNode);
                updateProcessingIndicator(g, d);

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

                previewImpact(d);
            })
            .on("mouseout", function(event, d) {
                console.log("Mouse out from server:", d.name);
                d.hovered = false;
                d.processing = false;
                const g = d3.select(this.parentNode);
                updateProcessingIndicator(g, d);
                tooltip.transition().duration(500).style("opacity", 0);

                updateImpactVisualization();
            });

        function previewImpact(hoveredNode) {
            const previewCrashedServers = nodes
                .filter(n => n.crashed || n.id === hoveredNode.id)
                .map(n => n.id);
            console.log("Preview crashed servers:", previewCrashedServers);

            const impactedFlows = flows.filter(flow => {
                const isImpacted = flow.conditions.some(condition =>
                    condition.path.some(nodeId => previewCrashedServers.includes(nodeId))
                );
                console.log(`Flow ${flow.name} impacted (preview): ${isImpacted}`);
                return isImpacted;
            });
            const intactFlows = flows.filter(flow => !impactedFlows.includes(flow));
            console.log("Impacted flows (preview):", impactedFlows.map(f => f.name));
            console.log("Intact flows (preview):", intactFlows.map(f => f.name));

            svg.selectAll(".node").each(function(d) {
                const g = d3.select(this);
                if (d.crashed) {
                    if (d.shape === "square") {
                        g.select("rect")
                            .attr("fill", "gray")
                            .attr("stroke", "gray");
                    } else if (d.shape === "cylinder") {
                        g.select("path")
                            .attr("fill", "gray")
                            .attr("stroke", "gray");
                    }
                } else {
                    if (d.shape === "square") {
                        g.select("rect")
                            .attr("fill", "none")
                            .attr("stroke", d.color);
                    } else if (d.shape === "cylinder") {
                        g.select("path")
                            .attr("fill", "none")
                            .attr("stroke", d.color);
                    }
                }
                g.select(".crash-indicator")
                    .style("opacity", (d.crashed || d.hovered) ? 1 : 0);
            });

            overlay.selectAll(".flow-line").remove();

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
                            flowName: `${step.flowName}${flow.conditions.length > 1 ? ` (${step.condition})` : ""}`,
                            offset,
                            color: "#FF0000"
                        });
                    });
                });
            });

            const impactedLink = overlay.selectAll(".impacted-flow-line")
                .data(impactedLines)
                .enter().append("g")
                .attr("class", "flow-line impacted-flow-line");

            impactedLink.each(function(d) {
                const linkGroup = d3.select(this);
                const adjusted = adjustLineToEdge(d.source, d.target, d.source.size, d.target.size);
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length === 0) return;

                const nx = -dy / length;
                const ny = dx / length;
                const offsetX = nx * d.offset;
                const offsetY = ny * d.offset;

                linkGroup.append("line")
                    .attr("x1", adjusted.x1 + offsetX)
                    .attr("y1", adjusted.y1 + offsetY)
                    .attr("x2", adjusted.x2 + offsetX)
                    .attr("y2", adjusted.y2 + offsetY)
                    .attr("stroke", d.color)
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
                            flowName: `${step.flowName}${flow.conditions.length > 1 ? ` (${step.condition})` : ""}`,
                            offset,
                            color: "#00FF00"
                        });
                    });
                });
            });

            const intactLink = overlay.selectAll(".intact-flow-line")
                .data(intactLines)
                .enter().append("g")
                .attr("class", "flow-line intact-flow-line");

            intactLink.each(function(d) {
                const linkGroup = d3.select(this);
                const adjusted = adjustLineToEdge(d.source, d.target, d.source.size, d.target.size);
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length === 0) return;

                const nx = -dy / length;
                const ny = dx / length;
                const offsetX = nx * d.offset;
                const offsetY = ny * d.offset;

                linkGroup.append("line")
                    .attr("x1", adjusted.x1 + offsetX)
                    .attr("y1", adjusted.y1 + offsetY)
                    .attr("x2", adjusted.x2 + offsetX)
                    .attr("y2", adjusted.y2 + offsetY)
                    .attr("stroke", d.color)
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
                    condition.path.forEach(nodeId => {
                        if (previewCrashedServers.includes(nodeId)) {
                            impactedNodes.add(nodeId);
                        }
                    });
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
                if (d.crashed || d.id === hoveredNode.id) {
                    g.select("rect, path")
                        .style("filter", "drop-shadow(0 0 5px #FF0000)");
                } else if (impactedNodes.has(d.id)) {
                    g.select("rect, path")
                        .style("filter", "drop-shadow(0 0 5px #FF0000)");
                } else if (intactNodes.has(d.id)) {
                    g.select("rect, path")
                        .style("filter", "drop-shadow(0 0 5px #00FF00)");
                } else {
                    g.select("rect, path")
                        .style("filter", "none");
                }
            });

            renderFlowLegendImpact(impactedFlows, intactFlows);
        }

        function updateImpactVisualization() {
            const crashedServers = nodes.filter(n => n.crashed).map(n => n.id);
            console.log("Crashed servers:", crashedServers);

            const impactedFlows = flows.filter(flow => {
                const isImpacted = flow.conditions.some(condition =>
                    condition.path.some(nodeId => crashedServers.includes(nodeId))
                );
                console.log(`Flow ${flow.name} impacted: ${isImpacted}`);
                return isImpacted;
            });
            const intactFlows = flows.filter(flow => !impactedFlows.includes(flow));
            console.log("Impacted flows:", impactedFlows.map(f => f.name));
            console.log("Intact flows:", intactFlows.map(f => f.name));

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

            overlay.selectAll(".flow-line").remove();

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
                            flowName: `${step.flowName}${flow.conditions.length > 1 ? ` (${step.condition})` : ""}`,
                            offset,
                            color: "#FF0000"
                        });
                    });
                });
            });

            const impactedLink = overlay.selectAll(".impacted-flow-line")
                .data(impactedLines)
                .enter().append("g")
                .attr("class", "flow-line impacted-flow-line");

            impactedLink.each(function(d) {
                const linkGroup = d3.select(this);
                const adjusted = adjustLineToEdge(d.source, d.target, d.source.size, d.target.size);
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length === 0) return;

                const nx = -dy / length;
                const ny = dx / length;
                const offsetX = nx * d.offset;
                const offsetY = ny * d.offset;

                linkGroup.append("line")
                    .attr("x1", adjusted.x1 + offsetX)
                    .attr("y1", adjusted.y1 + offsetY)
                    .attr("x2", adjusted.x2 + offsetX)
                    .attr("y2", adjusted.y2 + offsetY)
                    .attr("stroke", d.color)
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
                            flowName: `${step.flowName}${flow.conditions.length > 1 ? ` (${step.condition})` : ""}`,
                            offset,
                            color: "#00FF00"
                        });
                    });
                });
            });

            const intactLink = overlay.selectAll(".intact-flow-line")
                .data(intactLines)
                .enter().append("g")
                .attr("class", "flow-line intact-flow-line");

            intactLink.each(function(d) {
                const linkGroup = d3.select(this);
                const adjusted = adjustLineToEdge(d.source, d.target, d.source.size, d.target.size);
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length === 0) return;

                const nx = -dy / length;
                const ny = dx / length;
                const offsetX = nx * d.offset;
                const offsetY = ny * d.offset;

                linkGroup.append("line")
                    .attr("x1", adjusted.x1 + offsetX)
                    .attr("y1", adjusted.y1 + offsetY)
                    .attr("x2", adjusted.x2 + offsetX)
                    .attr("y2", adjusted.y2 + offsetY)
                    .attr("stroke", d.color)
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
                    condition.path.forEach(nodeId => {
                        if (crashedServers.includes(nodeId)) {
                            impactedNodes.add(nodeId);
                        }
                    });
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
                if (d.crashed) {
                    g.select("rect, path")
                        .style("filter", "drop-shadow(0 0 5px #FF0000)");
                } else if (impactedNodes.has(d.id)) {
                    g.select("rect, path")
                        .style("filter", "drop-shadow(0 0 5px #FF0000)");
                } else if (intactNodes.has(d.id)) {
                    g.select("rect, path")
                        .style("filter", "drop-shadow(0 0 5px #00FF00)");
                } else {
                    g.select("rect, path")
                        .style("filter", "none");
                }
            });

            renderFlowLegendImpact(impactedFlows, intactFlows);
        }

        updateImpactVisualization();
        console.log("Impact Analysis tab rendered");
    } catch (error) {
        console.error("Error in renderImpactAnalysis:", error);
        alert("Error rendering Impact Analysis tab: " + error.message + ". Check console for details.");
        svg.append("g")
            .attr("class", "error-message")
            .append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#FF0000")
            .attr("font-size", "16px")
            .text("Error rendering Impact Analysis tab: " + error.message);
    }
}

function renderFlowLegendImpact(impactedFlows = [], intactFlows = []) {
    console.log("Rendering flow legend for Impact Analysis at", new Date().toISOString(), { impactedFlows, intactFlows });
    try {
        svg.selectAll(".flow-legend").remove();
        const staticInfoHeight = staticInfo.length * 20 + 10;
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
                        color: "#FF0000",
                        flowObj: flow
                    });
                });
            } else {
                impactedEntries.push({
                    name: flow.name,
                    color: "#FF0000",
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
                        color: "#00FF00",
                        flowObj: flow
                    });
                });
            } else {
                intactEntries.push({
                    name: flow.name,
                    color: "#00FF00",
                    flowObj: flow
                });
            }
        });

        let yOffset = 0;
        if (impactedEntries.length > 0) {
            legendGroup.append("text")
                .attr("x", 5)
                .attr("y", yOffset + 10)
                .attr("font-size", "14px")
                .attr("font-weight", "bold")
                .attr("fill", "#FF0000")
                .text("Impacted Flows");
            yOffset += 20;

            impactedEntries.forEach((entry, i) => {
                const entryGroup = legendGroup.append("g")
                    .attr("transform", `translate(5, ${yOffset + i * 20 + 10})`);

                entryGroup.append("rect")
                    .attr("x", 0)
                    .attr("y", -8)
                    .attr("width", 10)
                    .attr("height", 10)
                    .attr("fill", entry.color);

                entryGroup.append("text")
                    .attr("x", 15)
                    .attr("y", 0)
                    .attr("font-size", "12px")
                    .attr("fill", "#E0E0E0")
                    .text(entry.name);
            });
            yOffset += impactedEntries.length * 20 + 10;
        }

        if (intactEntries.length > 0) {
            legendGroup.append("text")
                .attr("x", 5)
                .attr("y", yOffset + 10)
                .attr("font-size", "14px")
                .attr("font-weight", "bold")
                .attr("fill", "#00FF00")
                .text("Intact Flows");
            yOffset += 20;

            intactEntries.forEach((entry, i) => {
                const entryGroup = legendGroup.append("g")
                    .attr("transform", `translate(5, ${yOffset + i * 20 + 10})`);

                entryGroup.append("rect")
                    .attr("x", 0)
                    .attr("y", -8)
                    .attr("width", 10)
                    .attr("height", 10)
                    .attr("fill", entry.color);

                entryGroup.append("text")
                    .attr("x", 15)
                    .attr("y", 0)
                    .attr("font-size", "12px")
                    .attr("fill", "#E0E0E0")
                    .text(entry.name);
            });
            yOffset += intactEntries.length * 20;
        }

        const totalEntries = impactedEntries.length + intactEntries.length + (impactedEntries.length > 0 ? 1 : 0) + (intactEntries.length > 0 ? 1 : 0);
        const legendBoxHeight = totalEntries * 20 + 10;

        legendGroup.select("rect").remove();
        if (totalEntries > 0) {
            legendGroup.insert("rect", ":first-child")
                .attr("x", -5)
                .attr("y", -5)
                .attr("width", 400)
                .attr("height", legendBoxHeight)
                .attr("fill", "#2E3B3E")
                .attr("stroke", "#4A5A5D")
                .attr("stroke-width", 1)
                .attr("rx", 5);
        }

        console.log("Impact Analysis flow legend rendered with", impactedEntries.length, "impacted and", intactEntries.length, "intact entries");
    } catch (error) {
        console.error("Error in renderFlowLegendImpact:", error);
        alert("Error rendering Impact Analysis flow legend: " + error.message + ". Check console for details.");
        svg.append("g")
            .attr("class", "error-message")
            .append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#FF0000")
            .attr("font-size", "16px")
            .text("Error rendering Impact Analysis flow legend: " + error.message);
    }
}

function setupEventListeners() {
    console.log("Setting up event listeners at", new Date().toISOString());
    try {
        d3.select("#layer-infrastructure").on("click", async () => {
            console.log("Infrastructure tab clicked");
            await renderBlueprint();
        });

        d3.select("#layer-flows").on("click", async () => {
            console.log("Flows tab clicked");
            await updateFlowOptions();
            const selectedFlow = d3.select("#flow-select").property("value");
            const selectedCondition = d3.select("#condition-select").property("value") || flows.find(f => f.id === selectedFlow).conditions[0].id;
            await renderFlows(selectedFlow, selectedCondition);
        });

        d3.select("#layer-connections").on("click", async () => {
            console.log("Connections tab clicked");
            await renderConnections();
        });

        d3.select("#layer-watchpoints").on("click", async () => {
            console.log("Watchpoints tab clicked");
            await renderWatchpoints();
        });

        d3.select("#layer-impact-analysis").on("click", async () => {
            console.log("Impact Analysis tab clicked");
            await renderImpactAnalysis();
        });

        console.log("Event listeners set up for all tabs");
    } catch (error) {
        console.error("Error in setupEventListeners:", error);
        alert("Error setting up event listeners: " + error.message + ". Check console for details.");
        svg.append("g")
            .attr("class", "error-message")
            .append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#FF0000")
            .attr("font-size", "16px")
            .text("Error setting up event listeners: " + error.message);
    }
}

renderBlueprint().then(() => {
    console.log("Initial render complete, setting up event listeners");
    setupEventListeners();
}).catch(error => {
    console.error("Initial render failed:", error);
    alert("Initial render failed: " + error.message + ". Check console for details.");
    svg.append("g")
        .attr("class", "error-message")
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#FF0000")
        .attr("font-size", "16px")
        .text("Initial render failed: " + error.message);
});
