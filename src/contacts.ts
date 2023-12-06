import Airtable from 'airtable'
import {AirtableBase} from "airtable/lib/airtable_base.js";
import {config} from "dotenv";
import {FieldSet} from "airtable/lib/field_set.js";

interface AirtableInfo {
    token: string,
    base: string,
    contactsTable: string,
    client: AirtableBase
}

let loadedConfig: AirtableInfo | undefined

export function getAirtableInfo() {
    if (!loadedConfig) {
        throw Error(`You must load settings before you get them.`)
    }
    return loadedConfig
}

export function loadAirtableInfo() {
    config()
    const fromEnv = {
        token: process.env["AIRTABLE_ACCESS_TOKEN"] || '',
        base: process.env["AIRTABLE_BASE_ID"] || '',
        contactsTable: process.env["AIRTABLE_CONTACTS_TABLE_ID"] || '',
    }
    for (const key in fromEnv) {
        if (!fromEnv[key]) {
            throw Error(`Can't find needed config ${key} in the environment`)
        }
    }
    fromEnv['client'] = new Airtable({apiKey: fromEnv.token}).base(fromEnv.base)
    loadedConfig = fromEnv as AirtableInfo
}

export interface Contact {
    id: string,
    name: string,
    firstName: string,
    lastName: string,
    affiliations: string[]
}

export type IndexedContacts = { [name: string]: Contact }

export async function loadContacts() {
    const info = getAirtableInfo()
    const index: IndexedContacts = {}
    await info.client(info.contactsTable).select({
        fields: ["Name", "First Name", "Last Name", "Contact Affiliations"]
    }).eachPage((records, next) => {
        records.forEach((record) => {
            let fields = record.fields
            let name = getStringValue(fields, "Name")
            if (name.length > 0) {
                index[name.toLowerCase()] = {
                    id: record.id,
                    name,
                    firstName: getStringValue(fields, "First Name"),
                    lastName: getStringValue(fields, "Last Name"),
                    affiliations: getStringArrayValue(fields, "Contact Affiliations"),
                }
            }
        })
        next()
    })
    return index
}

export async function updateAffiliates(contact: Contact, affiliates: string[]) {
    const existing = contact.affiliations.toSorted()
    const suggested = affiliates.toSorted()
    const merged: string[] = []
    let updateNeeded = false
    let i = 0, j = 0
    while (i < existing.length && j < suggested.length) {
        if (existing[i] == suggested[j]) {
            merged.push(suggested[j])
            i++
            j++
        } else {
            updateNeeded = true
            if (existing[i] < suggested[j]) {
                i++
            } else {
                merged.push(suggested[j])
                j++
            }
        }
    }
    if (i < existing.length) {
        updateNeeded = true
    }
    if (j < suggested.length) {
        updateNeeded = true
        merged.push(...suggested.slice(j))
    }
    if (updateNeeded) {
        const info = getAirtableInfo()
        await info.client(info.contactsTable).update(contact.id, {
            'Contact Affiliations': merged
        })
    }
}

function getStringValue(fields: FieldSet, field: string) {
    let value = fields[field]
    if (typeof value === "string") {
        return value
    } else {
        return ''
    }
}

function getStringArrayValue(fields: FieldSet, field: string): string[] {
    let value = fields[field]
    if (value === undefined) {
        return []
    } else if (!Array.isArray(value)) {
        return []
    } else {
        return value
    }
}
