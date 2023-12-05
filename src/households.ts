import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { promises as fs } from 'fs'

export interface InputRow {
    firstName: string,
    lastName: string,
    name: string,
    accountName: string,
    fixNotes: string[],
    ignoreNotes: string[],
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

export async function readAllHouseholds(path: string) {
    const data = await fs.readFile(path)
    const records: { [n: string]: any } = parse(data, {
        columns: true,
        skipEmptyLines: true,
        skipRecordsWithError: true,
    })
    const rows: InputRow[] = records.map((r: { [x: string]: any }) => {
        return {
            firstName: r['First Name'].trim(),
            lastName: r['Last Name'].trim(),
            name: r['Name'].trim(),
            accountName: r['Account Name'].trim(),
            fixNotes: [],
            ignoreNotes: [],
        }
    })
    return rows
}

export async function writeAllHouseholds(households: IndexedRows, path: string) {
    const result: OutputRow[] = []
    for (let name in households) {
        const rows = households[name]
        for (let i = 0; i < rows.length; i++) {
            const affiliatedNames: string[] = []
            for (let j = 0; j < rows.length; j++) {
                if (j === i) {
                    continue
                }
                affiliatedNames.push(rows[j].name)
            }
            result.push({
                name: rows[i].name,
                firstName: rows[i].firstName,
                lastName: rows[i].lastName,
                affiliatedNames: affiliatedNames.join(','),
                accountName: rows[i].accountName,
                notes: (rows[i].fixNotes.concat(rows[i].ignoreNotes)).join('; '),
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
            row.ignoreNotes.push(`Ignoring household name with 'Account' or 'Foundation'`)
        } else if (name.endsWith(' Household')) {
            row.accountName = name.slice(0, name.length - 10).trim()
            row.fixNotes.push(`Trimmed 'Household' from end`)
        } else {
            row.ignoreNotes.push(`Ignoring badly-formatted household name`)
        }
    }
}

export async function mergeSameHousehold(rows: InputRow[]) {
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
    for (let name in households) {
        const where = name.search(' and ')
        const rows = households[name]
        if (where === -1) {
            if (rows.length !== 1) {
                rows[0].fixNotes.push(`Warning: ${rows.length} contacts in this household: ${name}`)
            }
        } else {
            if (name == rows[0].name || rows[0].name.search(/ and | & | \/ /) != -1) {
                rows[0].ignoreNotes.push(`Ignoring because existing contact has a suspicious name`)
                continue
            }
            if (name.slice(where + 5).search(' and ') != -1) {
                rows[0].ignoreNotes.push(`Ignoring because too many 'ands'!`)
                continue
            }
            if (rows.length == 1 && rows[0].ignoreNotes.length == 0) {
                const first = name.slice(0, where).toLowerCase()
                const second = name.slice(where + 5, name.length - (rows[0].lastName.length + 1)).toLowerCase() // +1 for space
                if (first != second || (first != rows[0].firstName.toLowerCase() && first != rows[0].name.toLowerCase())) {
                    maybeCreateContact(name, rows, where)
                } else {
                    rows[0].ignoreNotes.push(`Ignoring because the same contact appears twice`)
                }
            }
        }
    }
    return households
}

function maybeCreateContact(household: string, rows: InputRow[], where: number) {
    let contactName = rows[0].name
    let contactFirstName = rows[0].firstName
    let whereContact = household.search(contactName)
    let whereContactFirst = household.search(contactFirstName)
    if (whereContact === -1 && whereContactFirst === -1) {
        rows[0].ignoreNotes.push(`Ignoring because contact doesn't appear in household!`)
    } else if (whereContact > where || whereContactFirst > where) {
        // create contact from name before and
        const before = household.slice(0, where).trim()
        rows.splice(0, 0, createContact(household, before, rows[0].lastName))
    } else {
        // create contact from name after and
        const after = household.slice(where + 5).trim()
        rows.splice(0, 0, createContact(household, after, rows[0].lastName))
    }
}

function createContact(household: string, name: string, lastName: string) {
    const names = name.split(' ', 2)
    if (names.length == 2) {
        return {
            firstName: names[0],
            lastName: names[1],
            name: name,
            accountName: household,
            fixNotes: [`Created contact ${name}`],
            ignoreNotes: [],
        }
    } else {
        return {
            firstName: name,
            lastName: lastName,
            name: `${name} ${lastName}`,
            accountName: household,
            fixNotes: [`Created contact ${name} ${lastName}`],
            ignoreNotes: [],
        }
    }
}