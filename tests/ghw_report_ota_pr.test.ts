// import type CoreApi from '@actions/core';
// import type {Context} from '@actions/github/lib/context';

import type {Octokit} from "@octokit/rest";
import {describe, it, vi} from "vitest";

const github = {
    rest: {
        issues: {
            createComment:
                vi.fn<(...args: Parameters<Octokit["rest"]["issues"]["createComment"]>) => ReturnType<Octokit["rest"]["issues"]["createComment"]>>(),
        },
        pulls: {
            createReviewComment:
                vi.fn<
                    (
                        ...args: Parameters<Octokit["rest"]["pulls"]["createReviewComment"]>
                    ) => ReturnType<Octokit["rest"]["pulls"]["createReviewComment"]>
                >(),
        },
    },
};

describe("Github Workflow: Report OTA PR", () => {
    it("passes", () => {
        console.log(github);
    });
});
