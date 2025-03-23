// import type CoreApi from '@actions/core';
// import type {Context} from '@actions/github/lib/context';

import type {Octokit} from "@octokit/rest";

const github = {
    rest: {
        issues: {
            createComment: jest.fn<
                ReturnType<Octokit["rest"]["issues"]["createComment"]>,
                Parameters<Octokit["rest"]["issues"]["createComment"]>,
                unknown
            >(),
        },
        pulls: {
            createReviewComment: jest.fn<
                ReturnType<Octokit["rest"]["pulls"]["createReviewComment"]>,
                Parameters<Octokit["rest"]["pulls"]["createReviewComment"]>,
                unknown
            >(),
        },
    },
};

describe("Github Workflow: Report OTA PR", () => {
    it("passes", async () => {
        console.log(github);
    });
});
