import {
    readAllHouseholds,
    InputRow,
    canonicalizeHouseholdNames,
    mergeSameHousehold,
    IndexedRows,
    writeAllHouseholds
} from './households.js'
import assert from 'assert';

async function testLoadHouseholds(path: string = "local/household-accounts.csv") {
    const rows = await readAllHouseholds(path)
    assert(rows.length === 6687)
    return rows
}

async function testStripHouseholdSuffix(rows: InputRow[]) {
    await canonicalizeHouseholdNames(rows)
}

async function testAll(...tests: string[]) {
    if (tests.length == 0) {
        tests = ['input', 'strip', 'merge', 'output']
    }
    let rows: InputRow[] = []           // should really be test data
    let households: IndexedRows = {}    // should really be test data
    if (tests.includes('input')) {
        rows = await testLoadHouseholds()
    }
    if (tests.includes('strip')) {
        await testStripHouseholdSuffix(rows)
    }
    if (tests.includes('merge')) {
        households = await mergeSameHousehold(rows)
    }
    if (tests.includes('output')) {
        await writeAllHouseholds(households, 'local/household-contact-import.csv')
    }
}

testAll(...process.argv.slice(2))
    .then(() => console.log("Tests completed with no errors"))
