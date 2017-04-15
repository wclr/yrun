#!/usr/bin/env node
import * as fs from 'fs'
import * as path from 'path'
import { Key } from 'readline'
import { execSync } from 'child_process'
import { prompt, registerPrompt } from 'inquirer'
import * as chalk from 'chalk'
import * as glob from 'glob'

registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'))

type PackageManifest = {
  name: string,
  version: string
  scripts?: { [name: string]: string }
}

export function exec(cmd: string) {
  const stdio = [0, 1, 2]
  const execOptions = {
    stdio: stdio
  }
  execSync(cmd, execOptions)
}

export function fuzzyMatch(str: string, pattern: string) {
  // pattern = pattern.split('').reduce((a, b) => {
  //   return a + '.*' + b
  // })
  //return (new RegExp(pattern, 'i')).test(str);

  return !pattern.split(/\s+/).reduce((notMatch, part) => {
    return notMatch || !(new RegExp('(^|\\W)' + part, 'i')).test(str)
  }, false)

}

export const promptAutocomplete =
  <T>(message: string, items: { value: T, name: string, searchValue?: string }[]): Promise<T> => {
    return prompt(<any>{
      type: 'autocomplete',
      message,
      name: 'result',
      source: (answers: any, input: string) => {
        return Promise.resolve(
          (items as any[]).filter((item) => {
            return input
              ? fuzzyMatch(item.searchValue || item.value, input)
              : true
          })
        )
      },
    }).then(({ result }) => {
      return result
    }).catch((e) => {
      console.log('autocompletePrompt:', e)
    })
  }

export const promptInput =
  (message: string): Promise<string[]> => {
    return prompt(<any>{
      type: 'input',
      message,
      name: 'result',
    }).then(({ result }) => {
      return result
    }).catch((e) => {
      console.log('promptCheckbox:', e)
    })
  }

const packageFile = 'package.json'

const hasArg = (value: string) =>
  process.argv.reduce((has, arg) => has || arg === value, false)

const globIgnorePatterns = [
  '**/node_modules/**',
  '**/jspm_packages/**',
  '**/bower_components/**'
]

const readPackageFile = (packageFile: string) =>
  new Promise<PackageManifest>((resolve, reject) =>
    fs.readFile(packageFile, 'utf-8', (err, data) => {
      err ? reject(err) : resolve(JSON.parse(data))
    })
  )

const findPackageFiles = (all: boolean) => {
  const globPattern = all ? '**/package.json' : 'package.json'
  const options = {
    cwd: process.cwd(),
    ignore: globIgnorePatterns
  }
  return new Promise<string[]>((resolve) => {
    glob(globPattern, options, (err, matches) => {
      resolve(matches)
    })
  })
}

type DirScript = { name: string, cmd: string, dir: string, dirParts: string[] }

const getScriptsFromPackageFiles = async (files: string[]) => {
  const pgks = await Promise.all(files.map(readPackageFile))
  return pgks
    .reduce<DirScript[]>((packageScirpts, pkg, fileNumber) =>
      packageScirpts.concat(
        Object.keys(pkg.scripts || []).map(name => ({
          name,
          cmd: pkg.scripts![name],
          dir: path.dirname(files[fileNumber]),
          dirParts: files[fileNumber].split(/\\|\//).slice(0, -1)
        })))
    , []).sort((a, b) =>
      (a.dirParts.length - b.dirParts.length) ||
      ((b.dir === a.dir) ? 0 : (b.dir > a.dir) ? -1 : 1)
    )
}

const execute = async () => {

  const files = await findPackageFiles(hasArg('all'))

  if (!files.length) {
    console.log(`yrun: no scripts to execute in ${packageFile}.`)
    return
  }

  const dirScripts = await getScriptsFromPackageFiles(files)

  if (!dirScripts.length) {
    console.log(`yrun: no scripts to execute found.`)
    return
  }
  let askForParams = false
  const keyListener = (ch: string, key: Key) => {
    if (key.name === 'escape') {
      process.exit(0)
    }
  }
  process.stdin.addListener('keypress', keyListener)

  const getMenuName = (value: DirScript) => chalk.green(value.dirParts.join('/')) +
    (value.dirParts.length ? ': ' : '') +
    value.name

  const longestTaskName = dirScripts
    .map(script => script.name)
    .map(name => name.length).sort((a, b) => a - b).reverse()[0]

  const padName = (name: string, addMore: number) => name +
    (new Array(Math.max(longestTaskName - name.length + addMore, 0)))
      .join(' ')

  const shotern = (str: string, maxLength: number) =>
    str.substr(0, maxLength) + (str.length > maxLength ? '...' : '')

  const maxAvailableWidth = (process.stdout as any).columns as number - 15

  const choises = dirScripts.map((value, i) => ({
    value, name:
    padName(getMenuName(value), (value.dir.length)) +
    chalk.gray(` (${shotern(value.cmd, maxAvailableWidth - getMenuName(value).length)})`),
    searchValue: value.dirParts.join(' ') + ' ' + value.name
  }))

  const showChoise = async () => {
    const scriptToRun = await promptAutocomplete(
      'Choose script task to run:\n',
      choises
    )

    const action = await promptAutocomplete(
      `Proceed with running ${scriptToRun.name}?:`, [
        { value: 'run', name: 'Yes run it!' },
        { value: 'params', name: 'Let\'s add params to the script!' },
        { value: 'return', name: 'No, I changed my mind.' }
      ])
    if (action === 'return') {
      showChoise()
      return
    }
    let execCmd = (
      scriptToRun.dirParts.length ? `cd ${scriptToRun.dir} && ` : '') +
      'yarn run ' + scriptToRun.name
    if (action === 'params') {
      const params = await promptInput('Add params to script:')
      execCmd += ' -- ' + params
    }
    process.stdin.removeListener('keypress', keyListener)
    exec(execCmd)
  }
  showChoise()
}

execute()
