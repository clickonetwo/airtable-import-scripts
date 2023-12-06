import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { promises as fs } from 'fs'
import {Contact, IndexedContacts, updateAffiliates} from "./contacts.js";

export interface InputRow {
    firstName: string,
    lastName: string,
    name: string,
    accountName: string,
    fixNotes: string[],
    ignoreNotes: string[],
    airtableContact?: Contact
    affiliatedNames?: string[]
}

export interface OutputRow {
    name: string,
    firstName: string,
    lastName: string,
    affiliatedNames: string,
    accountName: string,
    notes: string,
}

export type IndexedRows = { [accountName: string]: InputRow[] }

export async function readAllHouseholds(contacts: IndexedContacts, path: string) {
    const data = await fs.readFile(path)
    const records: { [n: string]: any } = parse(data, {
        columns: true,
        skipEmptyLines: true,
        skipRecordsWithError: true,
    })
    const rows: InputRow[] = records.map((r: { [x: string]: any }) => {
        const name = r['Name'].trim()
        let accountName = r['Account Name'].trim()
        const row: InputRow = {
            firstName: r['First Name'].trim(),
            lastName: r['Last Name'].trim(),
            name,
            accountName,
            fixNotes: [],
            ignoreNotes: [],
        }
        const contact = contacts[name.toLowerCase()]
        if (contact) {
            row.airtableContact = contact
        } else {
            row.ignoreNotes.push(`No matching Airtable contact`)
        }
        return row
    })
    return rows
}

export async function writeAllHouseholds(households: IndexedRows, path: string) {
    const result: OutputRow[] = []
    for (let name in households) {
        const rows = households[name]
        for (const row of rows) {
            const affiliatedNames: string[] = row.affiliatedNames || []
            result.push({
                name: row.name,
                firstName: row.firstName,
                lastName: row.lastName,
                affiliatedNames: affiliatedNames.join(','),
                accountName: row.accountName,
                notes: row.fixNotes.concat(row.ignoreNotes).join('; '),
            })
        }
    }
    let data = stringify(result, {
        header: true,
        columns: [
            { key: 'name', header: 'Name' },
            { key: 'firstName', header: 'First Name' },
            { key: 'lastName', header: 'Last Name' },
            { key: 'affiliatedNames', header: 'Contact Affiliations' },
            { key: 'accountName', header: 'Account Name' },
            { key: 'notes', header: 'Notes' },
        ]
    })
    await fs.writeFile(path, data)
}

export async function canonicalizeHouseholdNames(rows: InputRow[]) {
    for (let row of rows) {
        let name = row.accountName
        let whereAmp = name.search(' & ')
        if (whereAmp != -1) {
            name = name.slice(0, whereAmp) + " and " + name.slice(whereAmp + 3)
            row.fixNotes.push(`Converted '&' to 'and'`)
        }
        let whereSlash = name.search(' / ')
        if (whereSlash != -1) {
            name = name.slice(0, whereSlash) + " and " + name.slice(whereSlash + 3)
            row.fixNotes.push(`Converted '/' to 'and'`)
        }
        if (name.search(/Account|Foundation/) != -1) {
            row.ignoreNotes.push(`Can't guess affiliates for accounts or foundations`)
        } else if (name.endsWith(' Household')) {
            row.accountName = name.slice(0, name.length - 10).trim()
        } else {
            row.ignoreNotes.push(`Can't guess affiliates for organizations`)
        }
    }
}

export async function mergeSameHousehold(contacts: IndexedContacts, rows: InputRow[]) {
    let households: IndexedRows = {}
    let distinct = 0
    for (let row of rows) {
        if (households.hasOwnProperty(row.accountName)) {
            households[row.accountName].push(row)
        } else {
            distinct += 1
            households[row.accountName] = [row]
        }
    }
    console.log(`There are ${distinct} households.`)
    for (let household in households) {
        const where = household.search(' and ')
        const rows = households[household]
        if (where !== -1) {
            if (rows[0].ignoreNotes.length > 0) {
                await addAffiliates(rows)
                continue
            }
            if (household == rows[0].name || rows[0].name.search(/ and | & | \/ /) != -1) {
                rows[0].ignoreNotes.push(`Can't guess at affiliates because contact is more than one person`)
                await addAffiliates(rows)
                continue
            }
            if (household.slice(where + 5).search(' and ') != -1) {
                rows[0].ignoreNotes.push(`Can't guess at affiliates because household has multiple 'ands'`)
                await addAffiliates(rows)
                continue
            }
            if (rows.filter(r => r.airtableContact !== undefined).length > 1) {
                rows[0].ignoreNotes.push(`Not guessing affiliates because household already has them`)
                await addAffiliates(rows)
                continue
            }
            const first = household.slice(0, where).toLowerCase()
            const lastNameLength = rows[0].lastName.length + 1  // including preceding space
            const second = household.slice(where + 5, household.length - lastNameLength).toLowerCase()
            if (first != second ||
                (first != rows[0].firstName.toLowerCase() && first != rows[0].name.toLowerCase())) {
                maybeCreateContact(contacts, household, rows, where)
            } else {
                rows[0].ignoreNotes.push(`Not guessing at affiliates it's a one-person household`)
            }
            await addAffiliates(rows)
        }
    }
    return households
}

async function addAffiliates(rows: InputRow[]) {
    if (rows.length == 1) {
        // Can't be any affiliates
        return
    }
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].airtableContact === undefined) {
            continue
        }
        const affiliatedIds: string[] = []
        const affiliatedNames: string[] = []
        for (let j = 0; j < rows.length; j++) {
            if (j === i) {
                continue
            }
            let contact = rows[j].airtableContact
            if (contact) {
                affiliatedIds.push(contact.id)
                affiliatedNames.push(contact.name)
            } else {
                rows[i].fixNotes.push(`No contact for affiliate ${rows[j].name}`)
            }
        }
        rows[i].affiliatedNames = affiliatedNames
        await updateAffiliates(rows[i].airtableContact!, affiliatedIds)
    }
}

function maybeCreateContact(contacts: IndexedContacts, household: string, rows: InputRow[], where: number) {
    let contactName = rows[0].name
    let contactFirstName = rows[0].firstName
    let whereContact = household.search(contactName)
    let whereContactFirst = household.search(contactFirstName)
    if (whereContact === -1 && whereContactFirst === -1) {
        rows[0].ignoreNotes.push(`Ignoring because contact doesn't appear in household!`)
    } else if (whereContact > where || whereContactFirst > where) {
        // create contact from name before ' and '
        const before = household.slice(0, where).trim()
        rows.push(createContact(contacts, household, before, rows[0].lastName))
    } else {
        // create contact from name after ' and '
        const after = household.slice(where + 5).trim()
        rows.push(createContact(contacts, household, after, rows[0].lastName))
    }
}

function createContact(contacts: IndexedContacts, household: string, name: string, lastName: string) {
    const names = name.split(' ', 2)
    let fullname: string
    if (names.length == 2) {
        fullname = name
    } else {
        fullname = `${name} ${lastName}`
    }
    let contact = contacts[fullname.toLowerCase()]
    let fixNotes = [`Guessed affiliate contact ${fullname}`]
    if (contact === undefined) {
        fixNotes = [`WARNING: Guessed non-contact affiliate: ${fullname}`]
    }
    return {
        firstName: name,
        lastName: lastName,
        name: fullname,
        accountName: household,
        fixNotes,
        ignoreNotes: [],
        airtableContact: contact
    }
}