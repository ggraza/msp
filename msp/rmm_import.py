# Copyright (c) 2026, itsdave GmbH and contributors
# For license information, please see license.txt

"""
RMM Import Module

This module provides functionality to import IT Objects from Tactical RMM.
It supports:
- Creating new IT Objects from RMM agents
- Updating existing IT Objects with RMM data
- Configurable field mappings (type, status)
- Selective sync of software and patch data
"""

import frappe
from frappe import _
from frappe.utils import now_datetime
import json
import importlib


# ==================== Main Whitelisted Functions ====================


@frappe.whitelist()
def create_import_session(documentation_name):
    """
    Create a new RMM Import Session and load all agents.

    Args:
        documentation_name: Name of the MSP Documentation

    Returns:
        Name of the created RMM Import Session
    """
    # Load MSP Documentation
    doc = frappe.get_doc("MSP Documentation", documentation_name)

    # Get RMM Instance and IT Landscape
    rmm_instance = _get_rmm_instance(doc)
    it_landscape = doc.landscape

    if not rmm_instance:
        frappe.throw(_("No RMM Instance configured for this documentation"))

    if not it_landscape:
        frappe.throw(_("No IT Landscape configured for this documentation"))

    # Get client and site filters
    client_filter = doc.tactical_rmm_tenant_caption
    site_filter = doc.tactical_rmm_site_name

    if not client_filter:
        frappe.throw(
            _("No Tactical RMM Tenant Caption configured in the documentation")
        )

    # Fetch agents from RMM
    agents = _fetch_agents_from_rmm(rmm_instance, client_filter, site_filter)

    # Create Import Session
    session = frappe.new_doc("RMM Import Session")
    session.documentation = documentation_name
    session.rmm_instance = rmm_instance
    session.it_landscape = it_landscape
    session.filter_client = client_filter
    session.filter_site = site_filter or ""
    session.status = "Draft"

    # Add agents to selection table
    for agent in agents:
        existing_it_object = find_existing_it_object(agent["agent_id"], rmm_instance)

        row = session.append("agent_selection", {})
        row.agent_id = agent["agent_id"]
        row.hostname = agent["hostname"]
        row.monitoring_type = agent.get("monitoring_type", "")
        row.site_name = agent.get("site_name", "")
        row.operating_system = agent.get("operating_system", "")
        row.status = agent.get("status", "")
        row.local_ip = _get_first_local_ip(agent)

        if existing_it_object:
            row.action = "Update"
            row.existing_it_object = existing_it_object
        else:
            row.action = "Create"

        row.selected = 0  # Not selected by default
        row.import_result = "Pending"

    session.insert()
    frappe.db.commit()

    return session.name


@frappe.whitelist()
def refresh_import_session(session_name):
    """
    Refresh the agent list in an existing Import Session.

    Args:
        session_name: Name of the RMM Import Session

    Returns:
        dict with agent_count
    """
    session = frappe.get_doc("RMM Import Session", session_name)

    if session.status != "Draft":
        frappe.throw(_("Can only refresh sessions in Draft status"))

    # Fetch agents from RMM
    agents = _fetch_agents_from_rmm(
        session.rmm_instance, session.filter_client, session.filter_site
    )

    # Clear existing selection
    session.agent_selection = []

    # Add agents to selection table
    for agent in agents:
        existing_it_object = find_existing_it_object(
            agent["agent_id"], session.rmm_instance
        )

        row = session.append("agent_selection", {})
        row.agent_id = agent["agent_id"]
        row.hostname = agent["hostname"]
        row.monitoring_type = agent.get("monitoring_type", "")
        row.site_name = agent.get("site_name", "")
        row.operating_system = agent.get("operating_system", "")
        row.status = agent.get("status", "")
        row.local_ip = _get_first_local_ip(agent)

        if existing_it_object:
            row.action = "Update"
            row.existing_it_object = existing_it_object
        else:
            row.action = "Create"

        row.selected = 0
        row.import_result = "Pending"

    session.save()
    frappe.db.commit()

    return {"agent_count": len(session.agent_selection)}


@frappe.whitelist()
def execute_import(session_name):
    """
    Execute the import for all selected agents.

    Args:
        session_name: Name of the RMM Import Session

    Returns:
        dict with created, updated, failed counts
    """
    session = frappe.get_doc("RMM Import Session", session_name)

    if session.status != "Draft":
        frappe.throw(_("Can only execute imports for sessions in Draft status"))

    # Get settings
    settings = frappe.get_single("RMM Import Settings")

    # Get all agents from RMM for full data
    all_agents = _fetch_agents_from_rmm(
        session.rmm_instance, session.filter_client, session.filter_site
    )

    # Create a lookup dict by agent_id
    agent_data_lookup = {a["agent_id"]: a for a in all_agents}

    # Update status
    session.status = "In Progress"
    session.import_log = ""
    session.add_log(f"Starting import for session {session_name}")
    session.save()
    frappe.db.commit()

    created = 0
    updated = 0
    failed = 0

    try:
        for row in session.agent_selection:
            if not row.selected:
                continue

            agent_data = agent_data_lookup.get(row.agent_id)
            if not agent_data:
                row.import_result = "Failed"
                row.import_message = "Agent not found in RMM"
                failed += 1
                session.add_log(f"FAILED: {row.hostname} - Agent not found in RMM")
                continue

            try:
                if row.action == "Create":
                    it_object = create_it_object_from_agent(
                        agent_data,
                        session.it_landscape,
                        session.rmm_instance,
                        settings,
                    )
                    row.import_result = "Success"
                    row.import_message = f"Created {it_object}"
                    row.existing_it_object = it_object
                    created += 1
                    session.add_log(f"CREATED: {row.hostname} -> {it_object}")

                elif row.action == "Update":
                    if not settings.update_existing:
                        row.import_result = "Failed"
                        row.import_message = "Update disabled in settings"
                        failed += 1
                        continue

                    update_it_object_from_agent(
                        row.existing_it_object, agent_data, settings
                    )
                    row.import_result = "Success"
                    row.import_message = f"Updated {row.existing_it_object}"
                    updated += 1
                    session.add_log(f"UPDATED: {row.hostname} -> {row.existing_it_object}")

            except Exception as e:
                row.import_result = "Failed"
                row.import_message = str(e)[:200]
                failed += 1
                session.add_log(f"FAILED: {row.hostname} - {str(e)}")
                frappe.log_error(
                    f"RMM Import Error for {row.hostname}: {str(e)}", "RMM Import"
                )

        # Update session results
        session.status = "Completed" if failed == 0 else "Completed"
        session.agents_created = created
        session.agents_updated = updated
        session.agents_failed = failed
        session.add_log(
            f"Import completed: {created} created, {updated} updated, {failed} failed"
        )
        session.save()
        frappe.db.commit()

    except Exception as e:
        session.status = "Failed"
        session.add_log(f"Import failed with error: {str(e)}")
        session.save()
        frappe.db.commit()
        frappe.throw(str(e))

    return {"created": created, "updated": updated, "failed": failed}


@frappe.whitelist()
def select_all_agents(session_name, action_filter=None):
    """
    Select all agents in a session, optionally filtered by action.

    Args:
        session_name: Name of the RMM Import Session
        action_filter: Optional filter for action (Create, Update)
    """
    session = frappe.get_doc("RMM Import Session", session_name)

    for row in session.agent_selection:
        if action_filter:
            if row.action == action_filter:
                row.selected = 1
        else:
            if row.action != "Skip":
                row.selected = 1

    session.save()
    return {"selected": sum(1 for r in session.agent_selection if r.selected)}


@frappe.whitelist()
def deselect_all_agents(session_name):
    """Deselect all agents in a session."""
    session = frappe.get_doc("RMM Import Session", session_name)

    for row in session.agent_selection:
        row.selected = 0

    session.save()
    return {"selected": 0}


# ==================== IT Object Matching Functions ====================


@frappe.whitelist()
def get_matching_suggestions(documentation_name):
    """
    Get suggestions for matching existing IT Objects with RMM Agents.

    Matching is based on:
    - Hostname similarity
    - IP address match
    - Serial number match

    Args:
        documentation_name: Name of the MSP Documentation

    Returns:
        dict with unmatched_objects, agents, and suggestions
    """
    doc = frappe.get_doc("MSP Documentation", documentation_name)

    rmm_instance = _get_rmm_instance(doc)
    it_landscape = doc.landscape

    if not rmm_instance or not it_landscape:
        frappe.throw(_("RMM Instance and IT Landscape are required"))

    # Get IT Objects without RMM assignment
    unmatched_objects = frappe.get_all(
        "IT Object",
        filters={
            "it_landscape": it_landscape,
            "rmm_agent_id": ["in", ["", None]]
        },
        fields=["name", "title", "main_ip", "serial_number", "type", "status", "rmm_local_ip"]
    )

    # Get main IP addresses for objects
    for obj in unmatched_objects:
        if obj.main_ip:
            ip_doc = frappe.db.get_value("IP Address", obj.main_ip, "ip_address")
            obj["ip_address"] = ip_doc or ""
        else:
            obj["ip_address"] = obj.get("rmm_local_ip", "")

    # Get RMM Agents
    client_filter = doc.tactical_rmm_tenant_caption
    site_filter = doc.tactical_rmm_site_name

    if not client_filter:
        frappe.throw(_("Tactical RMM Tenant Caption is required"))

    agents = _fetch_agents_from_rmm(rmm_instance, client_filter, site_filter)

    # Find already matched agent IDs
    matched_agent_ids = set(
        frappe.get_all(
            "IT Object",
            filters={"rmm_instance": rmm_instance, "rmm_agent_id": ["is", "set"]},
            pluck="rmm_agent_id"
        )
    )

    # Filter out already matched agents
    available_agents = [a for a in agents if a["agent_id"] not in matched_agent_ids]

    # Generate matching suggestions
    suggestions = []
    for obj in unmatched_objects:
        best_match = _find_best_match(obj, available_agents)
        suggestions.append({
            "it_object": obj["name"],
            "it_object_title": obj["title"],
            "it_object_ip": obj.get("ip_address", ""),
            "it_object_serial": obj.get("serial_number", ""),
            "it_object_type": obj.get("type", ""),
            "suggested_agent_id": best_match["agent_id"] if best_match else None,
            "suggested_hostname": best_match["hostname"] if best_match else None,
            "suggested_ip": _get_first_local_ip(best_match) if best_match else None,
            "confidence": best_match["confidence"] if best_match else 0,
            "match_reason": best_match["match_reason"] if best_match else "",
        })

    # Sort by confidence (highest first)
    suggestions.sort(key=lambda x: x["confidence"], reverse=True)

    # Format agents for dropdown selection
    agent_options = [
        {
            "agent_id": a["agent_id"],
            "hostname": a["hostname"],
            "local_ip": _get_first_local_ip(a),
            "site_name": a.get("site_name", ""),
            "monitoring_type": a.get("monitoring_type", ""),
            "label": f"{a['hostname']} ({_get_first_local_ip(a)}) - {a.get('site_name', '')}"
        }
        for a in available_agents
    ]

    return {
        "unmatched_count": len(unmatched_objects),
        "available_agents_count": len(available_agents),
        "suggestions": suggestions,
        "agents": agent_options,
        "rmm_instance": rmm_instance
    }


def _find_best_match(it_object, agents):
    """
    Find the best matching RMM agent for an IT Object.

    Scoring system (additive, capped at 100 for display):
    - AD GUID exact match: 150 points (definitive, highest priority)
    - IP address exact match: 90 points (strong indicator, but NAT can cause duplicates)
    - Serial number exact match: 85 points
    - Hostname exact match: 100 points (definitive)
    - Hostname similar (contains): 15 points (adds to IP match for 100%+)
    - Partial hostname match: up to 10 points

    Examples:
    - AD GUID match = 100% (displayed, actually 150 internal)
    - IP match alone = 90%
    - IP match + hostname similar = 100%+ (displayed as 100%)
    - Hostname exact = 100%
    - Serial + hostname similar = 100%

    Note: Client/Tenant filtering is already applied before this function,
    so all agents are from the same customer.

    Returns agent dict with added 'confidence' and 'match_reason' fields.
    """
    if not agents:
        return None

    obj_title = (it_object.get("title") or "").lower().strip()
    obj_ip = (it_object.get("ip_address") or "").strip()
    obj_serial = (it_object.get("serial_number") or "").lower().strip()
    obj_ad_guid = (it_object.get("ad_object_guid") or "").strip()

    best_match = None
    best_score = 0

    for agent in agents:
        agent_hostname = (agent.get("hostname") or "").lower().strip()
        # Check both local_ip (from processed data) and local_ips (from raw data)
        agent_ip = (agent.get("local_ip") or _get_first_local_ip(agent) or "").strip()
        agent_serial = (agent.get("serial_number") or "").lower().strip()
        agent_ad_guid = (agent.get("ad_guid") or "").strip()

        score = 0
        reasons = []

        # AD GUID exact match - definitive, highest priority
        if obj_ad_guid and agent_ad_guid and obj_ad_guid == agent_ad_guid:
            score += 150
            reasons.append("AD GUID")

        # IP address exact match - strong but not definitive (NAT scenarios)
        if obj_ip and agent_ip and obj_ip == agent_ip:
            score += 90
            reasons.append(f"IP-Adresse ({obj_ip})")

        # Serial number match (strong indicator)
        if obj_serial and agent_serial and obj_serial == agent_serial:
            # Ignore generic serials
            if obj_serial not in ["to be filled by o.e.m.", "default string", ""]:
                score += 85
                reasons.append("Seriennummer")

        # Exact hostname match - definitive
        if obj_title and agent_hostname and obj_title == agent_hostname:
            score += 100
            reasons.append("Hostname exakt")

        # Hostname contains or is contained (case-insensitive)
        # This adds to IP match to reach 100%+
        elif obj_title and agent_hostname:
            if obj_title in agent_hostname or agent_hostname in obj_title:
                score += 15
                reasons.append("Hostname ähnlich")
            else:
                # Partial hostname match (word-based)
                obj_words = set(obj_title.replace("-", " ").replace("_", " ").split())
                agent_words = set(agent_hostname.replace("-", " ").replace("_", " ").split())
                common_words = obj_words & agent_words
                if len(common_words) >= 1 and len(common_words) >= len(obj_words) * 0.5:
                    word_score = min(10, len(common_words) * 5)
                    score += word_score
                    reasons.append(f"Hostname teilweise ({', '.join(common_words)})")

        if score > best_score:
            best_score = score
            best_match = agent.copy()
            # Cap confidence at 100 for display purposes
            best_match["confidence"] = min(100, score)
            best_match["match_reason"] = ", ".join(reasons)

    # Only return matches with reasonable confidence
    if best_score >= 50:
        return best_match

    return None


@frappe.whitelist()
def apply_rmm_mappings(mappings, rmm_instance):
    """
    Apply RMM agent mappings to IT Objects.

    Args:
        mappings: JSON string of list with {it_object, agent_id} dicts
        rmm_instance: Name of the RMM Instance

    Returns:
        dict with success count and errors
    """
    if isinstance(mappings, str):
        mappings = json.loads(mappings)

    success_count = 0
    errors = []

    for mapping in mappings:
        it_object_name = mapping.get("it_object")
        agent_id = mapping.get("agent_id")

        if not it_object_name or not agent_id:
            continue

        try:
            it_object = frappe.get_doc("IT Object", it_object_name)
            it_object.rmm_agent_id = agent_id
            it_object.rmm_instance = rmm_instance
            it_object.last_rmm_sync = now_datetime()
            it_object.save()
            success_count += 1
        except Exception as e:
            errors.append(f"{it_object_name}: {str(e)}")
            frappe.log_error(f"Error mapping {it_object_name}: {str(e)}", "RMM Mapping")

    frappe.db.commit()

    return {
        "success": success_count,
        "errors": errors,
        "total": len(mappings)
    }


@frappe.whitelist()
def fetch_software_for_it_object(it_object_name):
    """
    Fetch and update installed software for a single IT Object from RMM.

    Args:
        it_object_name: Name of the IT Object

    Returns:
        dict with success status and software count
    """
    it_object = frappe.get_doc("IT Object", it_object_name)

    if not it_object.rmm_agent_id or not it_object.rmm_instance:
        frappe.throw(_("IT Object hat keine RMM-Verknüpfung"))

    software_list = _get_software_list(it_object.rmm_agent_id, it_object.rmm_instance)
    _populate_software_table(it_object, software_list)
    it_object.save()

    return {"success": True, "count": len(software_list)}


@frappe.whitelist()
def sync_matched_object(it_object_name):
    """
    Sync a single IT Object that has an RMM mapping with current RMM data.

    Args:
        it_object_name: Name of the IT Object

    Returns:
        dict with success status
    """
    it_object = frappe.get_doc("IT Object", it_object_name)

    if not it_object.rmm_agent_id or not it_object.rmm_instance:
        frappe.throw(_("IT Object has no RMM mapping"))

    # Get settings
    settings = frappe.get_single("RMM Import Settings")

    # Fetch agent data
    rmm_doc = frappe.get_doc("RMM Instance", it_object.rmm_instance)
    api_url, headers, verify_ssl = rmm_doc.get_api_credentials()

    import requests
    response = requests.get(
        f"{api_url}/agents/{it_object.rmm_agent_id}/",
        headers=headers,
        timeout=30,
        verify=verify_ssl
    )

    if response.status_code != 200:
        frappe.throw(_(f"Could not fetch agent data: HTTP {response.status_code}"))

    agent_data = response.json()

    # Update the IT Object
    update_it_object_from_agent(it_object_name, agent_data, settings)

    return {"success": True, "message": _("IT Object updated from RMM")}


@frappe.whitelist()
def get_available_agents_for_it_object(it_object_name):
    """
    Get available RMM agents for linking to an IT Object.

    Finds the RMM instance via the IT Object's landscape and returns
    all unlinked agents with matching suggestions.

    IMPORTANT: Filters agents by the tactical_rmm_tenant_caption from IT Landscape
    to only show agents belonging to the same customer/client.

    Args:
        it_object_name: Name of the IT Object

    Returns:
        dict with agents list, current_mapping info, and best_match suggestion
    """
    it_object = frappe.get_doc("IT Object", it_object_name)

    # Check if already mapped
    current_mapping = None
    if it_object.rmm_agent_id and it_object.rmm_instance:
        current_mapping = {
            "agent_id": it_object.rmm_agent_id,
            "rmm_instance": it_object.rmm_instance
        }

    # Get RMM instance and client filter from landscape
    rmm_instance = None
    client_filter = None
    if it_object.it_landscape:
        landscape = frappe.get_doc("IT Landscape", it_object.it_landscape)
        rmm_instance = landscape.rmm_instance
        client_filter = landscape.tactical_rmm_tenant_caption

    if not rmm_instance:
        return {
            "success": False,
            "error": _("No RMM Instance configured for this IT Landscape"),
            "agents": [],
            "current_mapping": current_mapping
        }

    # Get all agents from RMM
    tactical_rmm = importlib.import_module("msp.tactical-rmm")
    all_agents = tactical_rmm.get_all_agents(rmm_instance_name=rmm_instance)

    # Filter by client/tenant if configured in IT Landscape
    if client_filter:
        all_agents = [
            a for a in all_agents
            if a.get("client_name", "").lower() == client_filter.lower()
        ]

    # Find already mapped agent IDs
    matched_agent_ids = set(
        frappe.get_all(
            "IT Object",
            filters={
                "rmm_instance": rmm_instance,
                "rmm_agent_id": ["is", "set"],
                "name": ["!=", it_object_name]  # Exclude current object
            },
            pluck="rmm_agent_id"
        )
    )

    # Filter out already matched agents (except current mapping)
    available_agents = []
    for agent in all_agents:
        agent_id = agent.get("agent_id")
        if agent_id not in matched_agent_ids:
            available_agents.append({
                "agent_id": agent_id,
                "hostname": agent.get("hostname", ""),
                "client_name": agent.get("client_name", ""),
                "site_name": agent.get("site_name", ""),
                "local_ip": _get_first_local_ip(agent),
                "public_ip": agent.get("public_ip", ""),
                "operating_system": agent.get("operating_system", ""),
                "monitoring_type": agent.get("monitoring_type", ""),
                "status": agent.get("status", ""),
                "label": f"{agent.get('hostname', '')} ({_get_first_local_ip(agent)}) - {agent.get('site_name', '')}"
            })

    # Find best match for current IT Object
    it_object_data = {
        "title": it_object.title,
        "ip_address": "",
        "serial_number": it_object.serial_number
    }

    # Get IP address - check main_ip link first
    if it_object.main_ip:
        ip_doc = frappe.db.get_value("IP Address", it_object.main_ip, "ip_address")
        it_object_data["ip_address"] = ip_doc or ""
    elif it_object.rmm_local_ip:
        it_object_data["ip_address"] = it_object.rmm_local_ip

    # Find best match
    best_match = _find_best_match(it_object_data, available_agents)

    return {
        "success": True,
        "agents": available_agents,
        "rmm_instance": rmm_instance,
        "client_filter": client_filter,
        "current_mapping": current_mapping,
        "best_match": {
            "agent_id": best_match["agent_id"] if best_match else None,
            "hostname": best_match["hostname"] if best_match else None,
            "confidence": best_match["confidence"] if best_match else 0,
            "match_reason": best_match["match_reason"] if best_match else ""
        } if best_match else None
    }


@frappe.whitelist()
def link_it_object_to_agent(it_object_name, agent_id, rmm_instance, sync_now=False):
    """
    Link a single IT Object to an RMM agent.

    Args:
        it_object_name: Name of the IT Object
        agent_id: RMM Agent ID
        rmm_instance: RMM Instance name
        sync_now: If True, immediately sync data from RMM

    Returns:
        dict with success status
    """
    it_object = frappe.get_doc("IT Object", it_object_name)

    it_object.rmm_agent_id = agent_id
    it_object.rmm_instance = rmm_instance
    it_object.last_rmm_sync = now_datetime()
    it_object.save()
    frappe.db.commit()

    result = {
        "success": True,
        "message": _("IT Object linked to RMM agent")
    }

    # Optionally sync data
    if sync_now:
        try:
            sync_result = sync_matched_object(it_object_name)
            result["sync_result"] = sync_result
            result["message"] = _("IT Object linked and synced from RMM")
        except Exception as e:
            result["sync_error"] = str(e)
            result["message"] = _("IT Object linked, but sync failed: {0}").format(str(e))

    return result


@frappe.whitelist()
def unlink_it_object_from_agent(it_object_name):
    """
    Remove RMM agent link from an IT Object.

    Args:
        it_object_name: Name of the IT Object

    Returns:
        dict with success status
    """
    it_object = frappe.get_doc("IT Object", it_object_name)

    it_object.rmm_agent_id = None
    it_object.rmm_instance = None
    it_object.save()
    frappe.db.commit()

    return {
        "success": True,
        "message": _("RMM link removed from IT Object")
    }


# ==================== Core Import Functions ====================


def find_existing_it_object(agent_id, rmm_instance):
    """
    Find an existing IT Object by RMM agent ID and instance.

    Args:
        agent_id: RMM Agent ID
        rmm_instance: RMM Instance name

    Returns:
        IT Object name or None
    """
    return frappe.db.get_value(
        "IT Object", {"rmm_agent_id": agent_id, "rmm_instance": rmm_instance}, "name"
    )


def create_it_object_from_agent(agent, it_landscape, rmm_instance, settings):
    """
    Create a new IT Object from RMM agent data.

    Args:
        agent: Agent data dict from RMM
        it_landscape: IT Landscape name
        rmm_instance: RMM Instance name
        settings: RMM Import Settings document

    Returns:
        Name of the created IT Object
    """
    it_object = frappe.new_doc("IT Object")

    # Basic fields
    it_object.title = agent["hostname"]
    it_object.it_landscape = it_landscape
    it_object.rmm_agent_id = agent["agent_id"]
    it_object.rmm_instance = rmm_instance
    it_object.created_from_rmm = 1
    it_object.last_rmm_sync = now_datetime()

    # Type mapping
    monitoring_type = agent.get("monitoring_type", "")
    it_object_type = _apply_type_mapping(monitoring_type, settings)
    if it_object_type:
        it_object.type = it_object_type

    # Status mapping
    rmm_status = agent.get("status", "")
    it_object_status = _apply_status_mapping(rmm_status, settings)
    if it_object_status:
        it_object.status = it_object_status

    # RMM-specific fields
    it_object.rmm_local_ip = _get_first_local_ip(agent)
    it_object.rmm_public_ip = agent.get("public_ip", "")
    it_object.rmm_operating_system = agent.get("operating_system", "")
    it_object.rmm_last_seen = agent.get("last_seen", "")
    it_object.rmm_last_user = agent.get("logged_username", "")
    it_object.rmm_needs_reboot = 1 if agent.get("needs_reboot") else 0

    # AD-specific fields (if merged data available)
    if agent.get("ad_matched"):
        it_object.ad_object_guid = agent.get("ad_guid", "")
        it_object.ad_distinguished_name = agent.get("ad_distinguished_name", "")
        it_object.ad_account_status = agent.get("ad_account_status", "")
        it_object.ad_operating_system = agent.get("ad_operating_system", "")

        # Parse AD last logon if available
        ad_last_logon = agent.get("ad_last_logon", "")
        if ad_last_logon:
            try:
                from frappe.utils import get_datetime
                it_object.ad_last_logon = get_datetime(ad_last_logon)
            except Exception:
                pass

        it_object.last_ad_sync = now_datetime()

    # Serial number
    serial = agent.get("serial_number", "")
    if serial and serial not in ["To Be Filled By O.E.M.", "Default string"]:
        it_object.serial_number = serial

    # Format specs (legacy markdown)
    it_object.rmm_specs = format_rmm_specs(agent)

    # Populate hardware attributes child table
    _populate_hardware_attributes(it_object, agent)

    # Sync software if enabled
    if settings.sync_software:
        try:
            software_list = _get_software_list(agent["agent_id"], rmm_instance)
            _populate_software_table(it_object, software_list)
            # Also keep legacy markdown
            it_object.rmm_software = _format_software_markdown(software_list)
        except Exception as e:
            frappe.log_error(f"Error fetching software: {e}", "RMM Import")

    # Sync patches if enabled
    if settings.sync_patches:
        try:
            patches_list = _get_patches_list(agent["agent_id"], rmm_instance)
            _populate_patches_table(it_object, patches_list)
            # Update pending count
            it_object.rmm_patches_pending = sum(1 for p in patches_list if not p.get("installed"))
        except Exception as e:
            frappe.log_error(f"Error fetching patches: {e}", "RMM Import")

    it_object.insert()
    return it_object.name


def update_it_object_from_agent(it_object_name, agent, settings):
    """
    Update an existing IT Object from RMM agent data.

    Args:
        it_object_name: Name of the IT Object to update
        agent: Agent data dict from RMM
        settings: RMM Import Settings document
    """
    it_object = frappe.get_doc("IT Object", it_object_name)

    # Always update sync timestamp
    it_object.last_rmm_sync = now_datetime()

    # Update fields based on settings
    if settings.should_update_field("rmm_local_ip"):
        it_object.rmm_local_ip = _get_first_local_ip(agent)

    if settings.should_update_field("rmm_public_ip"):
        it_object.rmm_public_ip = agent.get("public_ip", "")

    if settings.should_update_field("rmm_operating_system"):
        it_object.rmm_operating_system = agent.get("operating_system", "")

    if settings.should_update_field("rmm_last_seen"):
        it_object.rmm_last_seen = agent.get("last_seen", "")

    if settings.should_update_field("rmm_last_user"):
        it_object.rmm_last_user = agent.get("logged_username", "")

    if settings.should_update_field("rmm_needs_reboot"):
        it_object.rmm_needs_reboot = 1 if agent.get("needs_reboot") else 0

    if settings.should_update_field("rmm_specs"):
        it_object.rmm_specs = format_rmm_specs(agent)
        # Also update hardware attributes table
        _populate_hardware_attributes(it_object, agent)

    if settings.should_update_field("title"):
        it_object.title = agent["hostname"]

    if settings.should_update_field("type"):
        monitoring_type = agent.get("monitoring_type", "")
        it_object_type = _apply_type_mapping(monitoring_type, settings)
        if it_object_type:
            it_object.type = it_object_type

    if settings.should_update_field("status"):
        rmm_status = agent.get("status", "")
        it_object_status = _apply_status_mapping(rmm_status, settings)
        if it_object_status:
            it_object.status = it_object_status

    if settings.should_update_field("serial_number"):
        serial = agent.get("serial_number", "")
        if serial and serial not in ["To Be Filled By O.E.M.", "Default string"]:
            it_object.serial_number = serial

    # Sync software if enabled
    if settings.sync_software and settings.should_update_field("rmm_software"):
        try:
            software_list = _get_software_list(agent["agent_id"], it_object.rmm_instance)
            _populate_software_table(it_object, software_list)
            # Also keep legacy markdown
            it_object.rmm_software = _format_software_markdown(software_list)
        except Exception as e:
            frappe.log_error(f"Error fetching software: {e}", "RMM Import")

    # Sync patches if enabled
    if settings.sync_patches and settings.should_update_field("rmm_patches_pending"):
        try:
            patches_list = _get_patches_list(agent["agent_id"], it_object.rmm_instance)
            _populate_patches_table(it_object, patches_list)
            # Update pending count
            it_object.rmm_patches_pending = sum(1 for p in patches_list if not p.get("installed"))
        except Exception as e:
            frappe.log_error(f"Error fetching patches: {e}", "RMM Import")

    # Sync AD fields if enabled and AD data available
    sync_ad = getattr(settings, 'sync_ad_fields_on_update', True)
    if sync_ad and agent.get("ad_matched"):
        it_object.ad_object_guid = agent.get("ad_guid", "")
        it_object.ad_distinguished_name = agent.get("ad_distinguished_name", "")
        it_object.ad_account_status = agent.get("ad_account_status", "")
        it_object.ad_operating_system = agent.get("ad_operating_system", "")

        # Parse AD last logon if available
        ad_last_logon = agent.get("ad_last_logon", "")
        if ad_last_logon:
            try:
                from frappe.utils import get_datetime
                it_object.ad_last_logon = get_datetime(ad_last_logon)
            except Exception:
                pass

        it_object.last_ad_sync = now_datetime()

    it_object.save()


# ==================== Helper Functions ====================


def _get_rmm_instance(doc):
    """Get RMM Instance from MSP Documentation (with cascade)."""
    # Priority: doc.rmm_instance > doc.landscape.rmm_instance
    if doc.rmm_instance:
        return doc.rmm_instance

    if doc.landscape:
        landscape = frappe.get_doc("IT Landscape", doc.landscape)
        return landscape.rmm_instance

    return None


def _fetch_agents_from_rmm(rmm_instance, client_filter, site_filter=None):
    """
    Fetch agents from RMM API.

    Uses the existing tactical-rmm.py functions.
    """
    # Import the existing tactical-rmm module (has hyphen in filename)
    tactical_rmm = importlib.import_module("msp.tactical-rmm")

    # Get all agents
    all_agents = tactical_rmm.get_all_agents(rmm_instance_name=rmm_instance)

    # Filter by client
    filtered = [
        a for a in all_agents if a.get("client_name", "").lower() == client_filter.lower()
    ]

    # Filter by site if specified
    if site_filter:
        filtered = [
            a for a in filtered if a.get("site_name", "").lower() == site_filter.lower()
        ]

    return filtered


def _get_first_local_ip(agent):
    """Get the first local IP from agent data."""
    local_ips = agent.get("local_ips", [])
    if isinstance(local_ips, list) and local_ips:
        return local_ips[0]
    elif isinstance(local_ips, str):
        return local_ips
    return ""


def _apply_type_mapping(monitoring_type, settings):
    """Apply type mapping from settings."""
    if not monitoring_type:
        return None

    # Try to get from settings mapping
    mapped_type = settings.get_type_mapping(monitoring_type)
    if mapped_type:
        return mapped_type

    # Auto-create if enabled
    if settings.auto_create_types:
        type_name = monitoring_type.capitalize()
        if not frappe.db.exists("IT Object Type", type_name):
            it_type = frappe.new_doc("IT Object Type")
            it_type.title = type_name
            it_type.insert()

        # Add to mapping for future use
        settings.append(
            "type_mapping",
            {"rmm_monitoring_type": monitoring_type, "it_object_type": type_name},
        )
        settings.save()
        return type_name

    return None


def _apply_status_mapping(rmm_status, settings):
    """Apply status mapping from settings."""
    if not rmm_status:
        return None

    return settings.get_status_mapping(rmm_status)


def format_rmm_specs(agent):
    """
    Format agent hardware specs as Markdown.

    Args:
        agent: Agent data dict from RMM

    Returns:
        Markdown formatted string
    """
    lines = ["## Hardware"]

    # Make/Model
    make_model = agent.get("make_model", "")
    if make_model and make_model != "System manufacturer System Product Name":
        lines.append(f"- **Model:** {make_model}")
    elif make_model == "System manufacturer System Product Name":
        lines.append("- **Model:** Not specified")

    # Serial
    serial = agent.get("serial_number", "")
    if serial and serial not in ["To Be Filled By O.E.M.", "Default string"]:
        lines.append(f"- **Serial:** {serial}")

    # CPU
    cpu = agent.get("cpu_model", [])
    if isinstance(cpu, list):
        cpu = ", ".join(cpu)
    if cpu:
        lines.append(f"- **CPU:** {cpu}")

    # GPU
    gpu = agent.get("graphics", "")
    if gpu:
        lines.append(f"- **GPU:** {gpu}")

    # Disks
    disks = agent.get("physical_disks", [])
    if isinstance(disks, list):
        disks = ", ".join(disks)
    if disks:
        lines.append(f"- **Disks:** {disks}")

    lines.append("")
    lines.append("## System")

    # OS
    os = agent.get("operating_system", "")
    if os:
        lines.append(f"- **OS:** {os}")

    # Status
    status = agent.get("status", "")
    if status:
        lines.append(f"- **Status:** {status}")

    # Last Seen
    last_seen = agent.get("last_seen", "")
    if last_seen:
        lines.append(f"- **Last Seen:** {last_seen}")

    # Last User
    last_user = agent.get("logged_username", "")
    if last_user:
        lines.append(f"- **Last User:** {last_user}")

    # Needs Reboot
    needs_reboot = agent.get("needs_reboot", False)
    lines.append(f"- **Needs Reboot:** {'Yes' if needs_reboot else 'No'}")

    return "\n".join(lines)


def _get_software_markdown(agent_id, rmm_instance):
    """
    Get installed software as Markdown.

    Uses existing tactical-rmm.py function.
    """
    tactical_rmm = importlib.import_module("msp.tactical-rmm")

    software_list = tactical_rmm.get_software_for_agent(
        agent_id, rmm_instance_name=rmm_instance
    )

    if not software_list:
        return "No software data available."

    lines = ["## Installed Software", ""]

    # Sort by name
    software_list = sorted(software_list, key=lambda x: x.get("name", "").lower())

    for sw in software_list[:100]:  # Limit to 100 entries
        name = sw.get("name", "Unknown")
        version = sw.get("version", "")
        if version:
            lines.append(f"- {name} ({version})")
        else:
            lines.append(f"- {name}")

    if len(software_list) > 100:
        lines.append(f"\n*...and {len(software_list) - 100} more*")

    return "\n".join(lines)


def _get_patch_summary(agent_id, rmm_instance):
    """
    Get Windows patch summary for an agent.

    Uses existing tactical-rmm.py function.
    """
    tactical_rmm = importlib.import_module("msp.tactical-rmm")

    patches = tactical_rmm.get_patches_for_agent(
        agent_id, rmm_instance_name=rmm_instance
    )

    if not patches:
        return {"pending": 0, "installed": 0}

    pending = sum(1 for p in patches if p.get("installed") == False)
    installed = sum(1 for p in patches if p.get("installed") == True)

    return {"pending": pending, "installed": installed}


# ==================== Child Table Population Functions ====================


def _populate_hardware_attributes(it_object, agent):
    """
    Populate the hardware_attributes child table from agent data.

    Clears existing entries and adds new ones from the agent.
    """
    # Clear existing entries
    it_object.hardware_attributes = []

    # Model/Manufacturer
    make_model = agent.get("make_model", "")
    if make_model and make_model not in ["System manufacturer System Product Name", ""]:
        # Try to split into manufacturer and model
        parts = make_model.split(" ", 1)
        if len(parts) == 2:
            it_object.append("hardware_attributes", {
                "attribute_type": "Manufacturer",
                "attribute_value": parts[0],
                "attribute_details": ""
            })
            it_object.append("hardware_attributes", {
                "attribute_type": "Model",
                "attribute_value": parts[1],
                "attribute_details": ""
            })
        else:
            it_object.append("hardware_attributes", {
                "attribute_type": "Model",
                "attribute_value": make_model,
                "attribute_details": ""
            })

    # Serial Number
    serial = agent.get("serial_number", "")
    if serial and serial not in ["To Be Filled By O.E.M.", "Default string", ""]:
        it_object.append("hardware_attributes", {
            "attribute_type": "Serial Number",
            "attribute_value": serial,
            "attribute_details": ""
        })

    # CPU - deduplicate entries (multi-core CPUs list each core)
    cpu = agent.get("cpu_model", [])
    if isinstance(cpu, list) and cpu:
        # Deduplicate and count
        cpu_counts = {}
        for c in cpu:
            # Clean up the CPU name (remove core/thread info if present)
            c_clean = c.strip()
            cpu_counts[c_clean] = cpu_counts.get(c_clean, 0) + 1

        # Format as "CPU Name (xN)" if multiple
        cpu_parts = []
        for cpu_name, count in cpu_counts.items():
            if count > 1:
                cpu_parts.append(f"{cpu_name} (x{count})")
            else:
                cpu_parts.append(cpu_name)
        cpu = ", ".join(cpu_parts)
    elif isinstance(cpu, str):
        cpu = cpu.strip()

    if cpu:
        it_object.append("hardware_attributes", {
            "attribute_type": "CPU",
            "attribute_value": cpu,
            "attribute_details": ""
        })

    # RAM
    total_ram = agent.get("total_ram", "")
    if total_ram:
        it_object.append("hardware_attributes", {
            "attribute_type": "RAM",
            "attribute_value": f"{total_ram} GB" if isinstance(total_ram, (int, float)) else str(total_ram),
            "attribute_details": ""
        })

    # GPU
    gpu = agent.get("graphics", "")
    if gpu:
        it_object.append("hardware_attributes", {
            "attribute_type": "GPU",
            "attribute_value": gpu,
            "attribute_details": ""
        })

    # Disks
    disks = agent.get("physical_disks", [])
    if disks:
        if isinstance(disks, list):
            for i, disk in enumerate(disks):
                it_object.append("hardware_attributes", {
                    "attribute_type": "Disk",
                    "attribute_value": disk if isinstance(disk, str) else str(disk),
                    "attribute_details": f"Disk {i+1}"
                })
        else:
            it_object.append("hardware_attributes", {
                "attribute_type": "Disk",
                "attribute_value": str(disks),
                "attribute_details": ""
            })

    # BIOS Version
    bios_ver = agent.get("bios_ver", "")
    if bios_ver:
        it_object.append("hardware_attributes", {
            "attribute_type": "BIOS",
            "attribute_value": bios_ver,
            "attribute_details": ""
        })


def _get_software_list(agent_id, rmm_instance):
    """
    Get installed software as list.

    Uses existing tactical-rmm.py function.
    """
    tactical_rmm = importlib.import_module("msp.tactical-rmm")

    result = tactical_rmm.get_software_for_agent(
        agent_id, rmm_instance_name=rmm_instance
    )

    # API returns {"id": .., "software": [...], "agent": ..} — extract the list
    if isinstance(result, dict):
        return result.get("software", [])

    return result or []


def _populate_software_table(it_object, software_list):
    """
    Populate the installed_software child table.

    Clears existing entries and adds new ones.
    """
    # Clear existing entries
    it_object.installed_software = []

    # Sort by name
    software_list = sorted(software_list, key=lambda x: x.get("name", "").lower())

    for sw in software_list:
        name = sw.get("name", "")
        if not name:
            continue

        # Parse install date if available
        install_date = None
        install_date_str = sw.get("install_date", "")
        if install_date_str:
            try:
                from frappe.utils import getdate
                install_date = getdate(install_date_str)
            except Exception:
                pass

        it_object.append("installed_software", {
            "software_name": name[:140],  # Limit length
            "version": (sw.get("version", "") or "")[:140],
            "publisher": (sw.get("publisher", "") or "")[:140],
            "install_date": install_date
        })


def _format_software_markdown(software_list):
    """
    Format software list as Markdown (legacy format).
    """
    if not software_list:
        return "No software data available."

    lines = ["## Installed Software", ""]

    # Sort by name
    software_list = sorted(software_list, key=lambda x: x.get("name", "").lower())

    for sw in software_list[:100]:  # Limit to 100 entries
        name = sw.get("name", "Unknown")
        version = sw.get("version", "")
        if version:
            lines.append(f"- {name} ({version})")
        else:
            lines.append(f"- {name}")

    if len(software_list) > 100:
        lines.append(f"\n*...and {len(software_list) - 100} more*")

    return "\n".join(lines)


def _get_patches_list(agent_id, rmm_instance):
    """
    Get Windows patches as list.

    Uses existing tactical-rmm.py function.
    """
    tactical_rmm = importlib.import_module("msp.tactical-rmm")

    patches = tactical_rmm.get_patches_for_agent(
        agent_id, rmm_instance_name=rmm_instance
    )

    return patches or []


def _populate_patches_table(it_object, patches_list):
    """
    Populate the installed_patches child table.

    Clears existing entries and adds new ones.
    """
    # Clear existing entries
    it_object.installed_patches = []

    for patch in patches_list:
        kb = patch.get("kb", "")
        title = patch.get("title", "")

        if not kb and not title:
            continue

        # Parse install date if available
        install_date = None
        install_date_str = patch.get("date_installed", "")
        if install_date_str:
            try:
                from frappe.utils import get_datetime
                install_date = get_datetime(install_date_str)
            except Exception:
                pass

        it_object.append("installed_patches", {
            "kb_number": kb or "",
            "title": (title or "")[:140],  # Limit length
            "severity": patch.get("severity", "") or "",
            "category": (patch.get("category", "") or "")[:140],
            "installed": 1 if patch.get("installed") else 0,
            "install_date": install_date
        })


# ==================== AD Integration Functions ====================


@frappe.whitelist()
def get_or_create_msp_documentation(it_landscape):
    """
    Findet oder erstellt MSP Documentation fuer eine IT Landscape.
    Bei Neuerstellung werden Default-AD-Credentials von IT Landscape uebernommen.

    Args:
        it_landscape: Name der IT Landscape

    Returns:
        dict: {name: str, created: bool, has_ad_config: bool, has_ad_data: bool}
    """
    # Suche bestehende MSP Documentation
    existing = frappe.db.get_value(
        "MSP Documentation",
        {"landscape": it_landscape},
        "name"
    )

    if existing:
        doc = frappe.get_doc("MSP Documentation", existing)
        has_ad_data = bool(doc.ad_computer_data_json and len(doc.ad_computer_data_json) > 10)
        return {
            "name": existing,
            "created": False,
            "has_ad_config": bool(doc.credentials_for_ldap_acquisistion),
            "has_ad_data": has_ad_data
        }

    # Erstelle neue MSP Documentation mit Default-AD aus IT Landscape
    landscape = frappe.get_doc("IT Landscape", it_landscape)

    new_doc = frappe.new_doc("MSP Documentation")
    new_doc.landscape = it_landscape
    new_doc.customer = landscape.customer
    new_doc.tactical_rmm_tenant_caption = landscape.tactical_rmm_tenant_caption

    # Default-AD-Konfiguration von IT Landscape uebernehmen
    if hasattr(landscape, 'default_ad_credentials') and landscape.default_ad_credentials:
        new_doc.credentials_for_ldap_acquisistion = landscape.default_ad_credentials
    if hasattr(landscape, 'default_ad_domain_controller') and landscape.default_ad_domain_controller:
        new_doc.domain_controller_for_ldap_acquisition = landscape.default_ad_domain_controller
    if hasattr(landscape, 'default_ad_use_nat') and landscape.default_ad_use_nat:
        new_doc.use_nat_address = landscape.default_ad_use_nat

    new_doc.insert()
    frappe.db.commit()

    has_ad_config = bool(
        hasattr(landscape, 'default_ad_credentials') and landscape.default_ad_credentials
    )

    return {
        "name": new_doc.name,
        "created": True,
        "has_ad_config": has_ad_config,
        "has_ad_data": False  # Neu erstellt, noch keine Daten
    }


@frappe.whitelist()
def get_ad_status(documentation_name):
    """
    Gibt AD-Status einer MSP Documentation zurueck.

    Args:
        documentation_name: Name der MSP Documentation

    Returns:
        dict: {has_config, has_data, computer_count, last_update}
    """
    doc = frappe.get_doc("MSP Documentation", documentation_name)

    has_config = bool(doc.credentials_for_ldap_acquisistion)
    has_data = bool(doc.ad_computer_data_json and len(doc.ad_computer_data_json) > 10)

    computer_count = 0
    last_update = None
    if has_data:
        try:
            data = json.loads(doc.ad_computer_data_json)
            computer_count = len(data) if isinstance(data, list) else 0
        except Exception:
            pass
        last_update = frappe.utils.format_datetime(doc.modified, "dd.MM.yyyy HH:mm")

    return {
        "has_config": has_config,
        "has_data": has_data,
        "computer_count": computer_count,
        "last_update": last_update
    }


@frappe.whitelist()
def create_import_session_from_landscape(it_landscape, include_ad_data=False):
    """
    Create a new RMM Import Session from an IT Landscape.
    Optionally includes AD data for enrichment.

    Args:
        it_landscape: Name of the IT Landscape
        include_ad_data: Whether to include AD data

    Returns:
        Name of the created RMM Import Session
    """
    include_ad_data = frappe.parse_json(include_ad_data) if isinstance(include_ad_data, str) else include_ad_data

    # Load IT Landscape
    landscape = frappe.get_doc("IT Landscape", it_landscape)

    rmm_instance = landscape.rmm_instance
    if not rmm_instance:
        frappe.throw(_("No RMM Instance configured for this IT Landscape"))

    client_filter = landscape.tactical_rmm_tenant_caption
    if not client_filter:
        frappe.throw(_("No Tactical RMM Tenant Caption configured in the IT Landscape"))

    # Find or create MSP Documentation
    msp_doc_info = get_or_create_msp_documentation(it_landscape)
    documentation_name = msp_doc_info["name"]

    # Fetch agents from RMM
    agents = _fetch_agents_from_rmm(rmm_instance, client_filter, None)

    # Merge with AD data if requested
    ad_data = []
    ad_stats = {"matched": 0, "rmm_only": 0, "ad_only": 0}

    if include_ad_data and msp_doc_info["has_ad_data"]:
        merged_agents, ad_stats = merge_rmm_and_ad_data(documentation_name, agents)
        agents = merged_agents

        # Load AD data for reference
        msp_doc = frappe.get_doc("MSP Documentation", documentation_name)
        try:
            ad_data = json.loads(msp_doc.ad_computer_data_json or "[]")
        except Exception:
            ad_data = []

    # Create Import Session
    session = frappe.new_doc("RMM Import Session")
    session.documentation = documentation_name
    session.rmm_instance = rmm_instance
    session.it_landscape = it_landscape
    session.filter_client = client_filter
    session.filter_site = ""
    session.status = "Draft"
    session.include_ad_data = 1 if include_ad_data else 0

    # AD statistics
    if include_ad_data:
        session.ad_matched_count = ad_stats.get("matched", 0)
        session.ad_only_count = ad_stats.get("ad_only", 0)
        session.rmm_only_count = ad_stats.get("rmm_only", 0)

    # Get settings
    settings = frappe.get_single("RMM Import Settings")

    # Add agents to selection table
    for agent in agents:
        existing_it_object = find_existing_it_object(agent["agent_id"], rmm_instance)

        # Also check by AD GUID if available
        if not existing_it_object and agent.get("ad_guid"):
            existing_it_object = frappe.db.get_value(
                "IT Object",
                {"ad_object_guid": agent["ad_guid"], "it_landscape": it_landscape},
                "name"
            )

        row = session.append("agent_selection", {})
        row.agent_id = agent["agent_id"]
        row.hostname = agent["hostname"]
        row.monitoring_type = agent.get("monitoring_type", "")
        row.site_name = agent.get("site_name", "")
        row.operating_system = agent.get("operating_system", "")
        row.status = agent.get("status", "")
        row.local_ip = _get_first_local_ip(agent)

        # AD fields
        row.ad_matched = 1 if agent.get("ad_matched") else 0
        row.ad_guid = agent.get("ad_guid", "")
        row.ad_account_status = agent.get("ad_account_status", "")
        row.ad_last_logon = agent.get("ad_last_logon", "")

        if existing_it_object:
            row.action = "Update"
            row.existing_it_object = existing_it_object
        else:
            row.action = "Create"

        # Auto-select based on settings
        if settings.skip_disabled_ad_accounts and agent.get("ad_account_status") == "Disabled":
            row.selected = 0
        else:
            row.selected = 0  # Not selected by default

        row.import_result = "Pending"

    # Update statistics
    session.agents_total = len(session.agent_selection)
    session.agents_to_create = sum(1 for r in session.agent_selection if r.action == "Create")
    session.agents_to_update = sum(1 for r in session.agent_selection if r.action == "Update")
    session.agents_skipped = sum(1 for r in session.agent_selection if r.action == "Skip")

    session.insert()
    frappe.db.commit()

    return session.name


def merge_rmm_and_ad_data(documentation_name, rmm_agents=None):
    """
    Kombiniert RMM-Agents mit AD-Computerdaten.

    Args:
        documentation_name: Name der MSP Documentation
        rmm_agents: Optional list of RMM agents (fetched if not provided)

    Returns:
        tuple: (merged_agents, stats)
        - merged_agents: Liste mit angereicherten Agent-Dicts
        - stats: {total_rmm, total_ad, matched, rmm_only, ad_only}
    """
    msp_doc = frappe.get_doc("MSP Documentation", documentation_name)

    # Load AD data
    ad_data = []
    if msp_doc.ad_computer_data_json:
        try:
            ad_data = json.loads(msp_doc.ad_computer_data_json)
        except Exception:
            ad_data = []

    if not ad_data:
        # No AD data available, return agents unchanged
        stats = {
            "total_rmm": len(rmm_agents) if rmm_agents else 0,
            "total_ad": 0,
            "matched": 0,
            "rmm_only": len(rmm_agents) if rmm_agents else 0,
            "ad_only": 0
        }
        return rmm_agents or [], stats

    # Fetch RMM agents if not provided
    if rmm_agents is None:
        rmm_instance = _get_rmm_instance(msp_doc)
        client_filter = msp_doc.tactical_rmm_tenant_caption
        rmm_agents = _fetch_agents_from_rmm(rmm_instance, client_filter, msp_doc.tactical_rmm_site_name)

    # Import the matching function from tactical-rmm
    tactical_rmm = importlib.import_module("msp.tactical-rmm")
    _find_best_ad_match = tactical_rmm._find_best_ad_match

    # Track matched AD items
    matched_ad_guids = set()
    merged_agents = []
    matched_count = 0

    for agent in rmm_agents:
        agent_copy = agent.copy()
        hostname = agent.get("hostname", "")

        # Find AD match
        ad_match = _find_best_ad_match(hostname, ad_data)

        if ad_match:
            matched_count += 1
            agent_copy["ad_matched"] = True
            agent_copy["ad_guid"] = ad_match.get("objectGUID", "") or ad_match.get("Object GUID", "")
            agent_copy["ad_distinguished_name"] = ad_match.get("distinguishedName", "") or ad_match.get("Distinguished Name", "")

            # Account status
            enabled = ad_match.get("Enabled", ad_match.get("enabled", ""))
            if enabled == True or enabled == "TRUE" or enabled == "True":
                agent_copy["ad_account_status"] = "Enabled"
            elif enabled == False or enabled == "FALSE" or enabled == "False":
                agent_copy["ad_account_status"] = "Disabled"
            else:
                agent_copy["ad_account_status"] = str(enabled) if enabled else ""

            # Last logon
            last_logon = ad_match.get("lastLogon", "") or ad_match.get("Last Logon Date", "")
            agent_copy["ad_last_logon"] = str(last_logon) if last_logon else ""

            # OS from AD
            agent_copy["ad_operating_system"] = ad_match.get("operatingSystem", "") or ad_match.get("Operating System", "")

            # Track matched GUID
            if agent_copy["ad_guid"]:
                matched_ad_guids.add(agent_copy["ad_guid"])
        else:
            agent_copy["ad_matched"] = False

        merged_agents.append(agent_copy)

    # Count AD-only entries (not matched to any RMM agent)
    ad_only_count = 0
    for ad_item in ad_data:
        ad_guid = ad_item.get("objectGUID", "") or ad_item.get("Object GUID", "")
        if ad_guid and ad_guid not in matched_ad_guids:
            ad_only_count += 1

    stats = {
        "total_rmm": len(rmm_agents),
        "total_ad": len(ad_data),
        "matched": matched_count,
        "rmm_only": len(rmm_agents) - matched_count,
        "ad_only": ad_only_count
    }

    return merged_agents, stats


@frappe.whitelist()
def sync_ad_data_for_existing_objects(it_landscape):
    """
    Synchronisiert AD-Daten zu bestehenden IT Objects basierend auf
    AD GUID oder Hostname-Match.

    Args:
        it_landscape: Name der IT Landscape

    Returns:
        dict: {synced_count, not_found_count, errors}
    """
    # Get MSP Documentation
    msp_doc_name = frappe.db.get_value(
        "MSP Documentation",
        {"landscape": it_landscape},
        "name"
    )

    if not msp_doc_name:
        return {"synced_count": 0, "not_found_count": 0, "errors": ["No MSP Documentation found"]}

    msp_doc = frappe.get_doc("MSP Documentation", msp_doc_name)

    # Load AD data
    if not msp_doc.ad_computer_data_json:
        return {"synced_count": 0, "not_found_count": 0, "errors": ["No AD data available"]}

    try:
        ad_data = json.loads(msp_doc.ad_computer_data_json)
    except Exception as e:
        return {"synced_count": 0, "not_found_count": 0, "errors": [f"Invalid AD data: {str(e)}"]}

    # Import matching function
    tactical_rmm = importlib.import_module("msp.tactical-rmm")
    _find_best_ad_match = tactical_rmm._find_best_ad_match

    # Get existing IT Objects for this landscape
    it_objects = frappe.get_all(
        "IT Object",
        filters={"it_landscape": it_landscape},
        fields=["name", "title", "ad_object_guid"]
    )

    synced_count = 0
    not_found_count = 0
    errors = []

    for obj in it_objects:
        try:
            it_object = frappe.get_doc("IT Object", obj["name"])

            # First try matching by existing AD GUID
            ad_match = None
            if it_object.ad_object_guid:
                for ad_item in ad_data:
                    ad_guid = ad_item.get("objectGUID", "") or ad_item.get("Object GUID", "")
                    if ad_guid == it_object.ad_object_guid:
                        ad_match = ad_item
                        break

            # If no match by GUID, try hostname matching
            if not ad_match:
                ad_match = _find_best_ad_match(it_object.title, ad_data)

            if ad_match:
                # Update AD fields
                it_object.ad_object_guid = ad_match.get("objectGUID", "") or ad_match.get("Object GUID", "")
                it_object.ad_distinguished_name = ad_match.get("distinguishedName", "") or ad_match.get("Distinguished Name", "")

                # Account status
                enabled = ad_match.get("Enabled", ad_match.get("enabled", ""))
                if enabled == True or enabled == "TRUE" or enabled == "True":
                    it_object.ad_account_status = "Enabled"
                elif enabled == False or enabled == "FALSE" or enabled == "False":
                    it_object.ad_account_status = "Disabled"

                # Last logon
                last_logon = ad_match.get("lastLogon", "") or ad_match.get("Last Logon Date", "")
                if last_logon:
                    try:
                        from frappe.utils import get_datetime
                        it_object.ad_last_logon = get_datetime(last_logon)
                    except Exception:
                        pass

                # OS from AD
                it_object.ad_operating_system = ad_match.get("operatingSystem", "") or ad_match.get("Operating System", "")
                it_object.last_ad_sync = now_datetime()

                it_object.save()
                synced_count += 1
            else:
                not_found_count += 1

        except Exception as e:
            errors.append(f"{obj['name']}: {str(e)}")

    frappe.db.commit()

    return {
        "synced_count": synced_count,
        "not_found_count": not_found_count,
        "errors": errors
    }
